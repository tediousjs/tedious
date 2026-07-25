// Parses a result set with a mix of column types - the shape most real
// queries have - straight through the token stream parser.

const { createBenchmark } = require('../common');

const { Parser } = require('tedious/lib/token/token-stream-parser');
const Debug = require('tedious/lib/debug');

const bench = createBenchmark(main, {
  n: [1, 10],
  rowCount: [1000, 10000]
});

// SQL_Latin1_General_CP1_CI_AS -> CP1252
const COLLATION = Buffer.from('0904D00034', 'hex');

const COLUMNS = [
  { name: 'id', info: Buffer.from([0x26, 0x04]) },                                        // IntN(4)
  { name: 'name', info: Buffer.concat([Buffer.from([0xE7, 0x64, 0x00]), COLLATION]) },     // NVarChar(50)
  { name: 'description', info: Buffer.concat([Buffer.from([0xE7, 0x90, 0x01]), COLLATION]) }, // NVarChar(200)
  { name: 'code', info: Buffer.concat([Buffer.from([0xA7, 0x32, 0x00]), COLLATION]) },     // VarChar(50)
  { name: 'created_at', info: Buffer.from([0x6F, 0x08]) },                                 // DateTimeN(8)
  { name: 'is_active', info: Buffer.from([0x68, 0x01]) },                                  // BitN(1)
  { name: 'amount', info: Buffer.from([0x6C, 0x09, 0x12, 0x02]) },                         // NumericN(9), p=18 s=2
  { name: 'ratio', info: Buffer.from([0x6D, 0x08]) },                                      // FloatN(8)
  { name: 'guid', info: Buffer.from([0x24, 0x10]) },                                       // UniqueIdentifier(16)
  { name: 'updated_at', info: Buffer.from([0x2A, 0x07]) }                                  // DateTime2 scale 7
];

function bVarchar(str) {
  return Buffer.concat([Buffer.from([str.length]), Buffer.from(str, 'ucs2')]);
}

function colMetadataToken() {
  const columnCount = Buffer.alloc(2);
  columnCount.writeUInt16LE(COLUMNS.length, 0);

  const parts = [Buffer.from([0x81]), columnCount];

  for (const column of COLUMNS) {
    const header = Buffer.alloc(6);
    header.writeUInt32LE(0, 0); // userType
    header.writeUInt16LE(0x0009, 4); // flags (nullable)

    parts.push(header, column.info, bVarchar(column.name));
  }

  return Buffer.concat(parts);
}

function rowToken(i) {
  const parts = [Buffer.from([0xD1])];

  const id = Buffer.alloc(5);
  id.writeUInt8(4, 0);
  id.writeInt32LE(i, 1);
  parts.push(id);

  for (const [str, encoding] of [['Row name ' + i, 'ucs2'], ['Example test description for row number ' + i, 'ucs2'], ['CODE-' + (i % 1000), 'latin1']]) {
    const body = Buffer.from(str, encoding);
    const length = Buffer.alloc(2);
    length.writeUInt16LE(body.length, 0);
    parts.push(length, body);
  }

  const dateTime = Buffer.alloc(9);
  dateTime.writeUInt8(8, 0);
  dateTime.writeInt32LE(44000 + (i % 1000), 1);
  dateTime.writeInt32LE((i * 977) % 25920000, 5);
  parts.push(dateTime);

  parts.push(Buffer.from([1, i % 2]));

  const numeric = Buffer.alloc(10);
  numeric.writeUInt8(9, 0);
  numeric.writeUInt8(1, 1);
  numeric.writeUInt32LE((i * 12345) >>> 0, 2);
  parts.push(numeric);

  const float = Buffer.alloc(9);
  float.writeUInt8(8, 0);
  float.writeDoubleLE(i / 7, 1);
  parts.push(float);

  const guid = Buffer.alloc(17);
  guid.writeUInt8(0x10, 0);
  for (let j = 0; j < 16; j++) {
    guid.writeUInt8((i + j * 31) & 0xFF, 1 + j);
  }
  parts.push(guid);

  const dateTime2 = Buffer.alloc(9);
  dateTime2.writeUInt8(8, 0);
  dateTime2.writeUIntLE((i * 1234567) % 864000000000, 1, 5);
  dateTime2.writeUIntLE(730119 + (i % 3000), 6, 3);
  parts.push(dateTime2);

  return Buffer.concat(parts);
}

function doneToken() {
  const buf = Buffer.alloc(13);
  buf.writeUInt8(0xFD, 0);
  buf.writeUInt16LE(0x0010, 1);
  buf.writeUInt16LE(0xC1, 3);
  buf.writeBigUInt64LE(0n, 5);
  return buf;
}

// Split into chunks the size of a default packet's payload, the way the
// incoming message stream would deliver them.
function packetPayloads(buf) {
  const chunks = [];
  for (let i = 0; i < buf.length; i += 4088) {
    chunks.push(buf.subarray(i, Math.min(i + 4088, buf.length)));
  }
  return chunks;
}

async function * repeat(chunks, n) {
  for (let i = 0; i < n; i++) {
    for (const chunk of chunks) {
      yield chunk;
    }
  }
}

function main({ n, rowCount }) {
  const parts = [colMetadataToken()];
  for (let i = 0; i < rowCount; i++) {
    parts.push(rowToken(i));
  }
  parts.push(doneToken());

  const chunks = packetPayloads(Buffer.concat(parts));

  const parser = new Parser(repeat(chunks, n), new Debug(), {
    onColMetadata: () => {},
    onRow: () => {},
    onDone: () => {}
  }, { useUTC: true, tdsVersion: '7_4' });

  bench.start();

  parser.on('end', () => {
    bench.end(n * rowCount);
  });
}
