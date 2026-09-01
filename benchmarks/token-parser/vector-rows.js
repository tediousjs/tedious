// Performance plan for the `vector` data type
// ============================================
//
// The flagship workload for the `vector` type is bulk-reading embeddings
// (e.g. thousands of rows of 1536-dimension vectors, ~6KB of payload per
// row), so the parsing path is designed around these rules:
//
// 1. One copy per value, not one read call per element: on little-endian
//    platforms the wire representation matches a `Float32Array`'s backing
//    storage, so the value parser performs a single bulk `Buffer#copy` into
//    the result array. (Big-endian platforms fall back to per-element
//    `readFloatLE` calls.)
// 2. The whole value is requested from the stream parser once (a single
//    `NotEnoughDataError` round trip), so a value straddling a packet
//    boundary does not re-enter the parser per element.
// 3. Exactly one allocation per value (the `Float32Array` itself), with no
//    intermediate buffers or arrays.
//
// This benchmark guards those properties by comparing vector row parsing
// against parsing `varbinary` rows of identical byte size. `varbinary`
// values are returned as zero-copy views into the packet buffer, so they
// form the throughput ceiling: the difference between the two configurations
// is the cost of allocating the `Float32Array` and copying the elements
// once, and must not grow beyond that (measured at roughly one third of the
// `varbinary` per-row cost for 1536 dimensions). The values are fed to the
// parser in 4KB chunks to also exercise the packet-boundary path.
//
// Run with:
//
//     node benchmarks/token-parser/vector-rows.js

const { createBenchmark } = require('../common');

const { Parser } = require('tedious/lib/token/token-stream-parser');

const bench = createBenchmark(main, {
  n: [10, 100],
  rows: [1000],
  dimensions: [1536],
  type: ['vector', 'varbinary']
});

const CHUNK_SIZE = 4096;

function buildColMetadata(type, valueLength) {
  const name = Buffer.from('value', 'ucs2');
  const buffer = Buffer.alloc(3 + 6 + (type === 'vector' ? 4 : 3) + 1 + name.length);
  let offset = 0;
  offset = buffer.writeUInt8(0x81, offset); // COLMETADATA
  offset = buffer.writeUInt16LE(1, offset); // column count
  offset = buffer.writeUInt32LE(0, offset); // userType
  offset = buffer.writeUInt16LE(0x0009, offset); // flags
  if (type === 'vector') {
    offset = buffer.writeUInt8(0xF5, offset); // VECTORTYPE
    offset = buffer.writeUInt16LE(valueLength, offset);
    offset = buffer.writeUInt8(0x00, offset); // dimension type: float32
  } else {
    offset = buffer.writeUInt8(0xA5, offset); // BIGVARBINARYTYPE
    offset = buffer.writeUInt16LE(valueLength, offset);
  }
  offset = buffer.writeUInt8(name.length / 2, offset);
  name.copy(buffer, offset);
  return buffer;
}

function buildRow(type, dimensions) {
  const valueLength = 8 + (dimensions * 4);
  const buffer = Buffer.alloc(1 + 2 + valueLength);
  let offset = 0;
  offset = buffer.writeUInt8(0xD1, offset); // ROW
  offset = buffer.writeUInt16LE(valueLength, offset);
  if (type === 'vector') {
    offset = buffer.writeUInt8(0xA9, offset); // layout format
    offset = buffer.writeUInt8(0x01, offset); // layout version
    offset = buffer.writeUInt16LE(dimensions, offset);
    offset = buffer.writeUInt8(0x00, offset); // dimension type: float32
    offset += 3; // reserved
  } else {
    offset += 8; // same byte size, opaque contents
  }
  for (let i = 0; i < dimensions; i++) {
    offset = buffer.writeFloatLE(Math.random(), offset);
  }
  return buffer;
}

function buildDone(rows) {
  const buffer = Buffer.alloc(13);
  buffer.writeUInt8(0xFD, 0); // DONE
  buffer.writeUInt16LE(0x0010, 1); // status: DONE_COUNT
  buffer.writeUInt16LE(0x00C1, 3);
  buffer.writeUInt32LE(rows, 5);
  return buffer;
}

function main({ n, rows, dimensions, type }) {
  const valueLength = 8 + (dimensions * 4);

  const row = buildRow(type, dimensions);
  const parts = [buildColMetadata(type, valueLength)];
  for (let i = 0; i < rows; i++) {
    parts.push(row);
  }
  parts.push(buildDone(rows));
  const data = Buffer.concat(parts);

  const chunks = [];
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    chunks.push(data.subarray(i, Math.min(i + CHUNK_SIZE, data.length)));
  }

  async function* repeat() {
    for (let i = 0; i < n; i++) {
      yield* chunks;
    }
  }

  const parser = new Parser(repeat(), { token() { } }, {
    onColMetadata: () => { },
    onRow: () => { },
    onDone: () => { }
  }, { tdsVersion: '7_4', useUTC: true, useColumnNames: false });

  bench.start();

  parser.on('end', () => {
    bench.end(n * rows);
  });
}
