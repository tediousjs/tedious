/**
 * Benchmark: Token parsing hot path — Result object vs tuple return values.
 *
 * This benchmark simulates the exact hot path that fires for every row returned
 * from SQL Server: helpers.readXxx → value-parser.readValue → row consumption.
 *
 * We construct realistic TDS row buffers for various column types and measure
 * parse throughput.
 *
 * Run: node --expose-gc benchmarks/token-parsing-bench.js
 * (must run `npm run build` first)
 */

'use strict';

const { Result, readUInt8, readUInt16LE, readInt16LE, readUInt32LE, readInt32LE,
  readBigInt64LE, readFloatLE, readDoubleLE, readBVarChar, readUsVarChar,
  readUNumeric64LE, readUNumeric96LE, readUNumeric128LE,
  readUInt24LE, readUInt40LE, readBigUInt64LE } = require('../lib/token/helpers');
const { readValue } = require('../lib/value-parser');
const { TYPE } = require('../lib/data-type');

// ---------------------------------------------------------------------------
// Buffer builders — create realistic TDS row data
// ---------------------------------------------------------------------------

function buildIntNRow(count) {
  const perCol = 5;
  const buf = Buffer.alloc(count * perCol);
  for (let i = 0; i < count; i++) {
    buf.writeUInt8(0x04, i * perCol);
    buf.writeInt32LE(i * 1000, i * perCol + 1);
  }
  return buf;
}

function buildFloatNRow(count) {
  const perCol = 9;
  const buf = Buffer.alloc(count * perCol);
  for (let i = 0; i < count; i++) {
    buf.writeUInt8(0x08, i * perCol);
    buf.writeDoubleLE(i * 3.14159, i * perCol + 1);
  }
  return buf;
}

function buildNVarCharRow(count, strLen) {
  const strBytes = strLen * 2;
  const perCol = 2 + strBytes;
  const buf = Buffer.alloc(count * perCol);
  const str = 'A'.repeat(strLen);
  for (let i = 0; i < count; i++) {
    const off = i * perCol;
    buf.writeUInt16LE(strBytes, off);
    buf.write(str, off + 2, 'ucs2');
  }
  return buf;
}

function buildMoneyRow(count) {
  const perCol = 9;
  const buf = Buffer.alloc(count * perCol);
  for (let i = 0; i < count; i++) {
    const off = i * perCol;
    buf.writeUInt8(0x08, off);
    buf.writeInt32LE(0, off + 1);
    buf.writeUInt32LE(100000, off + 5);
  }
  return buf;
}

function buildDateTimeRow(count) {
  const perCol = 9;
  const buf = Buffer.alloc(count * perCol);
  for (let i = 0; i < count; i++) {
    const off = i * perCol;
    buf.writeUInt8(0x08, off);
    buf.writeInt32LE(44000, off + 1);
    buf.writeInt32LE(10800000, off + 5);
  }
  return buf;
}

function buildMixedRow() {
  const parts = [];
  const metadata = [];

  // IntN x2
  for (let i = 0; i < 2; i++) {
    const b = Buffer.alloc(5);
    b.writeUInt8(0x04, 0);
    b.writeInt32LE(42 + i, 1);
    parts.push(b);
    metadata.push({ type: TYPE[0x26], collation: undefined, precision: undefined, scale: undefined, dataLength: 4 });
  }

  // FloatN x1
  {
    const b = Buffer.alloc(9);
    b.writeUInt8(0x08, 0);
    b.writeDoubleLE(3.14159, 1);
    parts.push(b);
    metadata.push({ type: TYPE[0x6D], collation: undefined, precision: undefined, scale: undefined, dataLength: 8 });
  }

  // NVarChar(20) x2
  for (let i = 0; i < 2; i++) {
    const str = 'Hello World Test!!!!';
    const strBytes = str.length * 2;
    const b = Buffer.alloc(2 + strBytes);
    b.writeUInt16LE(strBytes, 0);
    b.write(str, 2, 'ucs2');
    parts.push(b);
    metadata.push({ type: TYPE[0xE7], collation: undefined, precision: undefined, scale: undefined, dataLength: 20 });
  }

  // MoneyN x1
  {
    const b = Buffer.alloc(9);
    b.writeUInt8(0x08, 0);
    b.writeInt32LE(0, 1);
    b.writeUInt32LE(500000, 5);
    parts.push(b);
    metadata.push({ type: TYPE[0x6E], collation: undefined, precision: undefined, scale: undefined, dataLength: 8 });
  }

  // DateTimeN x1
  {
    const b = Buffer.alloc(9);
    b.writeUInt8(0x08, 0);
    b.writeInt32LE(44000, 1);
    b.writeInt32LE(10800000, 5);
    parts.push(b);
    metadata.push({ type: TYPE[0x6F], collation: undefined, precision: undefined, scale: undefined, dataLength: 8 });
  }

  // BitN x1
  {
    const b = Buffer.alloc(2);
    b.writeUInt8(0x01, 0);
    b.writeUInt8(0x01, 1);
    parts.push(b);
    metadata.push({ type: TYPE[0x68], collation: undefined, precision: undefined, scale: undefined, dataLength: 1 });
  }

  // IntN(2) = SmallInt
  {
    const b = Buffer.alloc(3);
    b.writeUInt8(0x02, 0);
    b.writeInt16LE(12345, 1);
    parts.push(b);
    metadata.push({ type: TYPE[0x26], collation: undefined, precision: undefined, scale: undefined, dataLength: 2 });
  }

  // IntN(1) = TinyInt
  {
    const b = Buffer.alloc(2);
    b.writeUInt8(0x01, 0);
    b.writeUInt8(255, 1);
    parts.push(b);
    metadata.push({ type: TYPE[0x26], collation: undefined, precision: undefined, scale: undefined, dataLength: 1 });
  }

  return { buf: Buffer.concat(parts), metadata };
}

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

const WARMUP_ITERATIONS = 50_000;
const BENCH_ITERATIONS = 500_000;
const BENCH_ROUNDS = 5;

function runBench(name, iterations, fn) {
  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    fn();
  }

  if (typeof globalThis.gc === 'function') {
    globalThis.gc();
  }

  const rounds = [];
  for (let r = 0; r < BENCH_ROUNDS; r++) {
    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      fn();
    }
    const end = process.hrtime.bigint();
    rounds.push(Number(end - start) / 1e6);

    if (typeof globalThis.gc === 'function') {
      globalThis.gc();
    }
  }

  const totalMs = rounds.reduce((a, b) => a + b, 0) / BENCH_ROUNDS;
  const opsPerSec = Math.round((iterations / totalMs) * 1000);
  const avgNsPerOp = Math.round((totalMs * 1e6) / iterations);

  return { name, totalMs, opsPerSec, avgNsPerOp, rounds };
}

function formatResult(r) {
  const roundsStr = r.rounds.map(t => t.toFixed(1) + 'ms').join(', ');
  return `${r.name.padEnd(40)} ${String(r.opsPerSec).padStart(12)} ops/sec    ${String(r.avgNsPerOp).padStart(6)} ns/op    [${roundsStr}]`;
}

// ---------------------------------------------------------------------------
// Benchmark: Low-level helpers
// ---------------------------------------------------------------------------

function benchHelpers() {
  console.log('\n=== Low-level helpers (readUInt8, readInt32LE, readUInt16LE, readDoubleLE) ===\n');

  const buf = Buffer.alloc(64);
  buf.writeUInt8(42, 0);
  buf.writeInt32LE(123456, 1);
  buf.writeUInt16LE(9999, 5);
  buf.writeDoubleLE(3.14159, 7);

  const results = [];

  results.push(runBench('readUInt8', BENCH_ITERATIONS, () => {
    readUInt8(buf, 0);
  }));

  results.push(runBench('readInt32LE', BENCH_ITERATIONS, () => {
    readInt32LE(buf, 1);
  }));

  results.push(runBench('readUInt16LE', BENCH_ITERATIONS, () => {
    readUInt16LE(buf, 5);
  }));

  results.push(runBench('readDoubleLE', BENCH_ITERATIONS, () => {
    readDoubleLE(buf, 7);
  }));

  // Compound: read IntN (readUInt8 + readInt32LE)
  const intNBuf = Buffer.alloc(5);
  intNBuf.writeUInt8(0x04, 0);
  intNBuf.writeInt32LE(42, 1);

  results.push(runBench('readUInt8 + readInt32LE (compound)', BENCH_ITERATIONS, () => {
    let offset = 0;
    let len;
    ({ offset, value: len } = readUInt8(intNBuf, offset));
    readInt32LE(intNBuf, offset);
  }));

  for (const r of results) {
    console.log(formatResult(r));
  }

  return results;
}

// ---------------------------------------------------------------------------
// Benchmark: readValue (the per-column dispatcher)
// ---------------------------------------------------------------------------

function benchReadValue() {
  console.log('\n=== readValue() per column type ===\n');

  const options = { useUTC: true, lowerCaseGuids: false, tdsVersion: '7_4', useColumnNames: false, columnNameReplacer: undefined, camelCaseColumns: false };
  const results = [];

  // IntN
  {
    const buf = buildIntNRow(1);
    const meta = { type: TYPE[0x26], collation: undefined, precision: undefined, scale: undefined, dataLength: 4 };
    results.push(runBench('readValue IntN(4)', BENCH_ITERATIONS, () => {
      readValue(buf, 0, meta, options);
    }));
  }

  // FloatN
  {
    const buf = buildFloatNRow(1);
    const meta = { type: TYPE[0x6D], collation: undefined, precision: undefined, scale: undefined, dataLength: 8 };
    results.push(runBench('readValue FloatN(8)', BENCH_ITERATIONS, () => {
      readValue(buf, 0, meta, options);
    }));
  }

  // NVarChar
  {
    const buf = buildNVarCharRow(1, 20);
    const meta = { type: TYPE[0xE7], collation: undefined, precision: undefined, scale: undefined, dataLength: 20 };
    results.push(runBench('readValue NVarChar(20)', BENCH_ITERATIONS, () => {
      readValue(buf, 0, meta, options);
    }));
  }

  // MoneyN
  {
    const buf = buildMoneyRow(1);
    const meta = { type: TYPE[0x6E], collation: undefined, precision: undefined, scale: undefined, dataLength: 8 };
    results.push(runBench('readValue MoneyN(8)', BENCH_ITERATIONS, () => {
      readValue(buf, 0, meta, options);
    }));
  }

  // DateTimeN
  {
    const buf = buildDateTimeRow(1);
    const meta = { type: TYPE[0x6F], collation: undefined, precision: undefined, scale: undefined, dataLength: 8 };
    results.push(runBench('readValue DateTimeN(8)', BENCH_ITERATIONS, () => {
      readValue(buf, 0, meta, options);
    }));
  }

  for (const r of results) {
    console.log(formatResult(r));
  }

  return results;
}

// ---------------------------------------------------------------------------
// Benchmark: Full row parsing simulation
// ---------------------------------------------------------------------------

function benchFullRow() {
  console.log('\n=== Full row parse (10 columns, mixed types) ===\n');

  const options = { useUTC: true, lowerCaseGuids: false, tdsVersion: '7_4', useColumnNames: false, columnNameReplacer: undefined, camelCaseColumns: false };
  const { buf, metadata } = buildMixedRow();
  const results = [];

  results.push(runBench('parseRow 10-col mixed', BENCH_ITERATIONS, () => {
    let offset = 0;
    for (let i = 0; i < metadata.length; i++) {
      const result = readValue(buf, offset, metadata[i], options);
      offset = result.offset;
    }
  }));

  // 5-col int-only rows
  {
    const intBuf = buildIntNRow(5);
    const intMeta = Array.from({ length: 5 }, () => ({
      type: TYPE[0x26], collation: undefined, precision: undefined, scale: undefined, dataLength: 4
    }));
    results.push(runBench('parseRow 5-col IntN', BENCH_ITERATIONS, () => {
      let offset = 0;
      for (let i = 0; i < 5; i++) {
        const result = readValue(intBuf, offset, intMeta[i], options);
        offset = result.offset;
      }
    }));
  }

  for (const r of results) {
    console.log(formatResult(r));
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('============================================================');
console.log('  Token Parsing Benchmark');
console.log('  Node ' + process.version + ', V8 ' + process.versions.v8);
console.log('  GC exposed: ' + (typeof globalThis.gc === 'function'));
console.log('============================================================');

const allResults = [];
allResults.push(...benchHelpers());
allResults.push(...benchReadValue());
allResults.push(...benchFullRow());

console.log('\n=== Summary ===\n');
for (const r of allResults) {
  console.log(formatResult(r));
}
