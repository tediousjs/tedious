const { createBenchmark } = require('../common');

const { ColumnEncryptionCipher } = require('tedious/lib/always-encrypted/cipher');
const StreamParser = require('tedious/lib/token/stream-parser');
const WritableTrackingBuffer = require('tedious/lib/tracking-buffer/writable-tracking-buffer');

// Parses rows of an `int`, an `nvarchar(50)` and a `datetime2(7)` column,
// with all of them either encrypted or not.
const bench = createBenchmark(main, {
  n: [100],
  rowCount: [1000],
  encrypted: [0, 1]
});

const FLAG_NULLABLE = 0x0001;
const FLAG_ENCRYPTED = 0x0800;

const COLUMNS = [
  { name: 'id', typeInfo: '2604', value: '2a000000', normalized: '2a00000000000000' },
  { name: 'name', typeInfo: 'e764000904d00034', value: Buffer.from('hello world', 'ucs2').toString('hex') },
  { name: 'created', typeInfo: '2a07', value: '87ee977669cb400b' }
];

function main({ n, rowCount, encrypted }) {
  const cipher = new ColumnEncryptionCipher(Buffer.alloc(32, 0x01));

  const options = {
    tdsVersion: '7_4',
    useUTC: true,
    serverSupportsColumnEncryption: encrypted === 1,
    columnEncryption: encrypted === 1 ? {} : undefined
  };

  const metadata = new WritableTrackingBuffer();
  metadata.writeUInt8(0x81);
  metadata.writeUInt16LE(COLUMNS.length);

  if (encrypted) {
    // A single column encryption key
    metadata.writeUInt16LE(1);
    metadata.writeUInt32LE(5);
    metadata.writeUInt32LE(1);
    metadata.writeUInt32LE(1);
    metadata.writeBuffer(Buffer.alloc(8));
    metadata.writeUInt8(1);
    metadata.writeUsVarbyte(Buffer.alloc(512));
    metadata.writeBVarchar('AZURE_KEY_VAULT', 'ucs2');
    metadata.writeUsVarchar('https://example.vault.azure.net/keys/cmk/1', 'ucs2');
    metadata.writeBVarchar('RSA_OAEP', 'ucs2');
  }

  const row = new WritableTrackingBuffer();
  row.writeUInt8(0xD1);

  for (const { name, typeInfo, value, normalized = value } of COLUMNS) {
    metadata.writeUInt32LE(0);

    if (encrypted) {
      metadata.writeUInt16LE(FLAG_NULLABLE | FLAG_ENCRYPTED);
      metadata.writeBuffer(Buffer.from('a5401f', 'hex')); // varbinary(8000)
      metadata.writeUInt16LE(0); // the column encryption key
      metadata.writeUInt32LE(0);
      metadata.writeBuffer(Buffer.from(typeInfo, 'hex'));
      metadata.writeUInt8(2); // AEAD_AES_256_CBC_HMAC_SHA256
      metadata.writeUInt8(2); // randomized
      metadata.writeUInt8(1);

      row.writeUsVarbyte(cipher.encrypt(Buffer.from(normalized, 'hex'), false));
    } else {
      metadata.writeUInt16LE(FLAG_NULLABLE);
      metadata.writeBuffer(Buffer.from(typeInfo, 'hex'));

      // A length prefix of one byte, or of two bytes for the string.
      const data = Buffer.from(value, 'hex');
      if (name === 'name') {
        row.writeUsVarbyte(data);
      } else {
        row.writeUInt8(data.length);
        row.writeBuffer(data);
      }
    }

    metadata.writeBVarchar(name, 'ucs2');
  }

  const rows = Buffer.concat(new Array(rowCount).fill(Buffer.from(row.data)));
  const metadataData = Buffer.from(metadata.data);

  bench.start();

  let tokenCount = 0;
  for (let i = 0; i < n; i++) {
    const parser = new StreamParser(options);

    parser.write(metadataData);
    const token = parser.read();
    if (encrypted) {
      token.columnEncryptionKeys[0].cipher = cipher;
    }

    parser.write(rows);
    while (parser.read() !== undefined) {
      tokenCount += 1;
    }
  }

  if (tokenCount !== n * rowCount) {
    throw new Error(`parsed ${tokenCount} rows`);
  }

  bench.end(n * rowCount);
}
