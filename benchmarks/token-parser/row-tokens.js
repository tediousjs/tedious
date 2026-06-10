'use strict';

// Parses a synthesized TDS token stream of ROW tokens (no PLP values),
// to measure raw row/value parsing throughput.

const { createBenchmark } = require('../common');

const { Parser } = require('tedious/lib/token/token-stream-parser');
const WritableTrackingBuffer = require('tedious/lib/tracking-buffer/writable-tracking-buffer');

const bench = createBenchmark(main, {
  schema: ['narrow', 'wide', 'chars'],
  rows: [100],
  n: [500]
});

// Raw collation bytes for SQL_Latin1_General_CP1_CI_AS (LCID 0x0409 -> CP1252)
const COLLATION = Buffer.from('0904d00034', 'hex');

function writeColMetadata(buf, columns) {
  buf.writeUInt8(0x81);
  buf.writeUInt16LE(columns.length);

  for (const column of columns) {
    buf.writeUInt32LE(0); // userType
    buf.writeUInt16LE(8); // flags (nullable)
    buf.writeUInt8(column.typeId);

    switch (column.kind) {
      case 'fixed':
        break;

      case 'byteLen':
        buf.writeUInt8(column.dataLength);
        break;

      case 'numeric':
        buf.writeUInt8(17); // max length
        buf.writeUInt8(column.precision);
        buf.writeUInt8(column.scale);
        break;

      case 'usShortLen':
        buf.writeUInt16LE(column.dataLength);
        if (column.collation) {
          buf.writeBuffer(COLLATION);
        }
        break;
    }

    buf.writeBVarchar(column.name, 'ucs2');
  }
}

function writeDone(buf) {
  buf.writeUInt8(0xFD);
  buf.writeUInt16LE(0x0000); // status: DONE_FINAL
  buf.writeUInt16LE(0x0000); // curCmd
  buf.writeBigUInt64LE(0n); // rowCount (TDS 7.2+)
}

const SCHEMAS = {
  narrow: {
    columns: [
      { name: 'id', typeId: 0x38, kind: 'fixed' }, // INT4
      { name: 'name', typeId: 0xE7, kind: 'usShortLen', dataLength: 100, collation: true }, // NVARCHAR(50)
      { name: 'active', typeId: 0x68, kind: 'byteLen', dataLength: 1 }, // BITN
      { name: 'created', typeId: 0x6F, kind: 'byteLen', dataLength: 8 } // DATETIMN
    ],
    writeRow(buf, i) {
      buf.writeUInt8(0xD1);
      buf.writeInt32LE(i); // id
      const name = 'Row name ' + i;
      buf.writeUInt16LE(name.length * 2);
      buf.writeString(name, 'ucs2');
      buf.writeUInt8(1); // active length
      buf.writeUInt8(i & 1);
      buf.writeUInt8(8); // created length
      buf.writeInt32LE(44000 + i); // days
      buf.writeUInt32LE(19440000); // 300ths of a second
    }
  },

  wide: {
    columns: [
      { name: 'id', typeId: 0x38, kind: 'fixed' }, // INT4
      { name: 'flag', typeId: 0x68, kind: 'byteLen', dataLength: 1 }, // BITN
      { name: 'amount', typeId: 0x3E, kind: 'fixed' }, // FLT8
      { name: 'price', typeId: 0x6C, kind: 'numeric', precision: 18, scale: 2 }, // NUMERICN
      { name: 'created', typeId: 0x6F, kind: 'byteLen', dataLength: 8 }, // DATETIMN
      { name: 'guid', typeId: 0x24, kind: 'byteLen', dataLength: 16 }, // GUIDN
      { name: 'name', typeId: 0xE7, kind: 'usShortLen', dataLength: 100, collation: true }, // NVARCHAR(50)
      { name: 'code', typeId: 0xA7, kind: 'usShortLen', dataLength: 20, collation: true }, // VARCHAR(20)
      { name: 'qty', typeId: 0x26, kind: 'byteLen', dataLength: 4 }, // INTN(4)
      { name: 'ts', typeId: 0x7F, kind: 'fixed' } // INT8
    ],
    writeRow(buf, i) {
      buf.writeUInt8(0xD1);
      buf.writeInt32LE(i); // id
      buf.writeUInt8(1); // flag length
      buf.writeUInt8(i & 1);
      buf.writeDoubleLE(i * 1.5); // amount
      buf.writeUInt8(9); // price length
      buf.writeUInt8(1); // sign
      buf.writeBigUInt64LE(BigInt(123456 + i));
      buf.writeUInt8(8); // created length
      buf.writeInt32LE(44000 + i);
      buf.writeUInt32LE(19440000);
      buf.writeUInt8(16); // guid length
      buf.writeBuffer(Buffer.from('0123456789abcdef0123456789abcdef', 'hex'));
      const name = 'Row name ' + i;
      buf.writeUInt16LE(name.length * 2);
      buf.writeString(name, 'ucs2');
      const code = 'C' + (1000 + i);
      buf.writeUInt16LE(code.length);
      buf.writeString(code, 'ascii');
      buf.writeUInt8(4); // qty length
      buf.writeInt32LE(i * 10);
      buf.writeBigInt64LE(BigInt(1700000000000) + BigInt(i)); // ts
    }
  }
};

SCHEMAS.chars = {
  columns: [
    { name: 'id', typeId: 0x38, kind: 'fixed' }, // INT4
    { name: 'col1', typeId: 0xA7, kind: 'usShortLen', dataLength: 60, collation: true }, // VARCHAR(60)
    { name: 'col2', typeId: 0xA7, kind: 'usShortLen', dataLength: 60, collation: true },
    { name: 'col3', typeId: 0xA7, kind: 'usShortLen', dataLength: 60, collation: true },
    { name: 'col4', typeId: 0xA7, kind: 'usShortLen', dataLength: 60, collation: true },
    { name: 'col5', typeId: 0xA7, kind: 'usShortLen', dataLength: 60, collation: true },
    { name: 'col6', typeId: 0xA7, kind: 'usShortLen', dataLength: 60, collation: true }
  ],
  writeRow(buf, i) {
    buf.writeUInt8(0xD1);
    buf.writeInt32LE(i); // id
    for (let col = 1; col <= 6; col++) {
      const value = 'Some varchar value ' + col + ' in row ' + i;
      buf.writeUInt16LE(value.length);
      buf.writeString(value, 'ascii');
    }
  }
};

function buildTokenStream(schema, rows) {
  const buf = new WritableTrackingBuffer(1024, null, true);

  writeColMetadata(buf, schema.columns);
  for (let i = 0; i < rows; i++) {
    schema.writeRow(buf, i);
  }
  writeDone(buf);

  return buf.data;
}

async function * repeat(data, n) {
  for (let i = 0; i < n; i++) {
    yield data;
  }
}

function main({ schema: schemaName, rows, n }) {
  const data = buildTokenStream(SCHEMAS[schemaName], rows);

  const debug = { token() {} };

  let rowCount = 0;
  const parser = new Parser(repeat(data, n), debug, {
    onColMetadata() {},
    onRow() { rowCount++; },
    onDone() {},
    onDoneInProc() {},
    onDoneProc() {}
  }, { tdsVersion: '7_4', useUTC: true });

  bench.start();

  parser.on('end', () => {
    if (rowCount !== rows * n) {
      throw new Error(`expected ${rows * n} rows, got ${rowCount}`);
    }

    bench.end(n);
  });
}
