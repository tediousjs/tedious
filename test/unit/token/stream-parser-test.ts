import { assert } from 'chai';

import Parser, { type ParserOptions } from '../../../src/token/stream-parser';
import { Readable } from 'stream';

import { ColumnValueToken, DoneToken, NBCRowToken, ReturnValueToken, RowToken, type Token, ValueChunkToken, ValueStartToken } from '../../../src/token/token';
import { type ColumnMetadata } from '../../../src/token/colmetadata-token-parser';
import { typeByName as dataTypeByName } from '../../../src/data-type';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';

const options = { tdsVersion: '7_2', useUTC: false } as ParserOptions;

function column(colName: string, type: ColumnMetadata['type'], dataLength?: number): ColumnMetadata {
  return {
    colName,
    userType: 0,
    flags: 0,
    precision: undefined,
    scale: undefined,
    dataLength,
    schema: undefined,
    udtInfo: undefined,
    type,
    collation: undefined
  };
}

function writeDone(buffer: WritableTrackingBuffer, tdsVersion: string) {
  buffer.writeUInt8(0xFD);
  buffer.writeUInt16LE(0x0010); // status: row count is valid
  buffer.writeUInt16LE(0); // curCmd
  if (tdsVersion < '7_2') {
    buffer.writeUInt32LE(42);
  } else {
    buffer.writeBigUInt64LE(42n);
  }
}

// Writes a PLP value in PLP chunks of (at most) `chunkSize` bytes.
function writePLP(buffer: WritableTrackingBuffer, value: Buffer, chunkSize: number) {
  buffer.writeBigUInt64LE(BigInt(value.length));
  for (let offset = 0; offset < value.length; offset += chunkSize) {
    const chunk = value.subarray(offset, offset + chunkSize);
    buffer.writeUInt32LE(chunk.length);
    buffer.writeBuffer(chunk);
  }
  buffer.writeUInt32LE(0);
}

function readAll(parser: Parser) {
  const tokens = [];

  let token;
  while ((token = parser.read()) !== undefined) {
    tokens.push(token);
  }

  return tokens;
}

function parseByteByByte(data: Buffer, colMetadata: ColumnMetadata[], streamValues = false) {
  const parser = new Parser(options, colMetadata);
  parser.streamValues = streamValues;

  const tokens = [];
  for (const byte of data) {
    parser.write(Buffer.from([byte]));
    tokens.push(...readAll(parser));
  }
  parser.end();

  return tokens;
}

describe('Stream Parser', function() {
  it('returns `undefined` until a token is complete', function() {
    const buffer = new WritableTrackingBuffer();
    writeDone(buffer, '7_2');

    const parser = new Parser(options);
    assert.isUndefined(parser.read());

    parser.write(buffer.data.subarray(0, 5));
    assert.isUndefined(parser.read());

    parser.write(buffer.data.subarray(5));
    assert.instanceOf(parser.read(), DoneToken);
    assert.isUndefined(parser.read());

    parser.end();
  });

  it('parses tokens lazily, so option changes apply to the following tokens', function() {
    const opts = { ...options, tdsVersion: '7_4' };

    const buffer = new WritableTrackingBuffer();
    writeDone(buffer, '7_4');
    writeDone(buffer, '7_1');

    const parser = new Parser(opts);
    parser.write(buffer.data);

    const first = parser.read() as DoneToken;
    assert.strictEqual(first.rowCount, 42);

    // Like the TDS version negotiated via a `LOGINACK` token.
    opts.tdsVersion = '7_1';

    const second = parser.read() as DoneToken;
    assert.strictEqual(second.rowCount, 42);

    assert.isUndefined(parser.read());
    parser.end();
  });

  it('throws on `end` if the data ended in the middle of a token', function() {
    const buffer = new WritableTrackingBuffer();
    writeDone(buffer, '7_2');

    const parser = new Parser(options);
    parser.write(buffer.data.subarray(0, buffer.data.length - 1));
    assert.isUndefined(parser.read());

    assert.throws(() => {
      parser.end();
    }, 'unexpected end of data');
  });

  it('throws on `end` if the data ended in the middle of a partially parsed row', function() {
    const buffer = new WritableTrackingBuffer();
    buffer.writeUInt8(0xD1);
    buffer.writeInt32LE(1);

    const parser = new Parser(options, [column('a', dataTypeByName.Int), column('b', dataTypeByName.Int)]);
    parser.write(buffer.data);
    assert.isUndefined(parser.read());

    assert.throws(() => {
      parser.end();
    }, 'unexpected end of data');
  });

  it('parses rows with PLP values that arrive byte by byte', function() {
    const colMetadata = [
      column('a', dataTypeByName.Int),
      column('b', dataTypeByName.VarBinary, 0xFFFF),
      column('c', dataTypeByName.NVarChar, 0xFFFF)
    ];

    const binary = Buffer.from(Array.from({ length: 100 }, (_, i) => i));
    const text = 'hello world';

    const buffer = new WritableTrackingBuffer();
    for (let i = 0; i < 2; i++) {
      buffer.writeUInt8(0xD1);
      buffer.writeInt32LE(i);
      writePLP(buffer, binary, 7);
      writePLP(buffer, Buffer.from(text, 'ucs2'), 5);
    }

    const tokens = parseByteByByte(buffer.data, colMetadata);

    assert.lengthOf(tokens, 2);
    tokens.forEach((token, i) => {
      assert.instanceOf(token, RowToken);
      assert.strictEqual(token.columns[0].value, i);
      assert.deepEqual(token.columns[1].value, binary);
      assert.strictEqual(token.columns[2].value, text);
    });
  });

  it('parses NBCROW tokens that arrive byte by byte', function() {
    const colMetadata = Array.from({ length: 10 }, (_, i) => column(`col${i}`, dataTypeByName.Int));

    const buffer = new WritableTrackingBuffer();
    buffer.writeUInt8(0xD2);
    // Every odd column is null.
    buffer.writeUInt8(0b10101010);
    buffer.writeUInt8(0b00000010);
    for (let i = 0; i < 10; i += 2) {
      buffer.writeInt32LE(i);
    }

    const tokens = parseByteByByte(buffer.data, colMetadata);

    assert.lengthOf(tokens, 1);
    assert.instanceOf(tokens[0], NBCRowToken);
    assert.deepEqual(tokens[0].columns.map((c: { value: unknown }) => c.value), [0, null, 2, null, 4, null, 6, null, 8, null]);
  });

  it('parses RETURNVALUE tokens with PLP values that arrive byte by byte', function() {
    const value = 'a'.repeat(50);

    const buffer = new WritableTrackingBuffer();
    buffer.writeUInt8(0xAC);
    buffer.writeUInt16LE(1); // ordinal
    buffer.writeBVarchar('@out', 'ucs2');
    buffer.writeUInt8(0x01); // status
    buffer.writeUInt32LE(0); // user type
    buffer.writeUInt16LE(0); // flags
    buffer.writeUInt8(0xE7); // NVarChar
    buffer.writeUInt16LE(0xFFFF); // max
    buffer.writeBuffer(Buffer.from([0x09, 0x04, 0xD0, 0x00, 0x34])); // collation
    writePLP(buffer, Buffer.from(value, 'ucs2'), 16);

    const tokens = parseByteByByte(buffer.data, []);

    assert.lengthOf(tokens, 1);
    const token = tokens[0] as ReturnValueToken;
    assert.instanceOf(token, ReturnValueToken);
    assert.strictEqual(token.paramOrdinal, 1);
    assert.strictEqual(token.paramName, 'out');
    assert.strictEqual(token.value, value);
  });

  it('parses a PLP null value', function() {
    const buffer = new WritableTrackingBuffer();
    buffer.writeUInt8(0xD1);
    buffer.writeBigUInt64LE(0xFFFFFFFFFFFFFFFFn);

    const tokens = parseByteByByte(buffer.data, [column('a', dataTypeByName.VarBinary, 0xFFFF)]);

    assert.lengthOf(tokens, 1);
    assert.instanceOf(tokens[0], RowToken);
    assert.isNull(tokens[0].columns[0].value);
  });

  it('rejects PLP values whose length does not match the announced length', function() {
    const buffer = new WritableTrackingBuffer();
    buffer.writeUInt8(0xD1);
    buffer.writeBigUInt64LE(10n);
    buffer.writeUInt32LE(4);
    buffer.writeBuffer(Buffer.alloc(4));
    buffer.writeUInt32LE(0);

    const parser = new Parser(options, [column('a', dataTypeByName.VarBinary, 0xFFFF)]);
    parser.write(buffer.data);

    assert.throws(() => {
      parser.read();
    }, 'Partially Length-prefixed Bytes unmatched lengths : expected 10, but got 4 bytes');
  });

  describe('streaming values', function() {
    // Summarize streamed tokens, merging consecutive value chunks.
    function summarize(tokens: Token[]) {
      const summary: unknown[] = [];

      for (const token of tokens) {
        if (token instanceof ColumnValueToken) {
          summary.push(['COLUMN_VALUE', token.index, token.value]);
        } else if (token instanceof ValueStartToken) {
          summary.push(['VALUE_START', token.index, token.length]);
        } else if (token instanceof ValueChunkToken) {
          const last = summary[summary.length - 1];
          if (Array.isArray(last) && last[0] === 'VALUE_DATA') {
            last[1] = Buffer.concat([last[1], token.data]);
          } else {
            summary.push(['VALUE_DATA', token.data]);
          }
        } else {
          summary.push(token.name);
        }
      }

      return summary;
    }

    it('streams PLP values of rows that arrive byte by byte', function() {
      const colMetadata = [
        column('a', dataTypeByName.Int),
        column('b', dataTypeByName.VarBinary, 0xFFFF),
        column('c', dataTypeByName.NVarChar, 0xFFFF),
        column('d', dataTypeByName.VarBinary, 0xFFFF)
      ];

      const binary = Buffer.from(Array.from({ length: 100 }, (_, i) => i));

      const buffer = new WritableTrackingBuffer();
      buffer.writeUInt8(0xD1);
      buffer.writeInt32LE(7);
      writePLP(buffer, binary, 7);
      writePLP(buffer, Buffer.alloc(0), 1);
      buffer.writeBigUInt64LE(0xFFFFFFFFFFFFFFFFn); // null
      writeDone(buffer, '7_2');

      const tokens = parseByteByByte(buffer.data, colMetadata, true);

      assert.deepEqual(summarize(tokens), [
        'ROW_START',
        ['COLUMN_VALUE', 0, 7],
        ['VALUE_START', 1, 100],
        ['VALUE_DATA', binary],
        'VALUE_END',
        ['VALUE_START', 2, 0],
        'VALUE_END',
        ['COLUMN_VALUE', 3, null],
        'ROW_END',
        'DONE'
      ]);
    });

    it('streams NBCROW tokens', function() {
      const colMetadata = [
        column('a', dataTypeByName.Int),
        column('b', dataTypeByName.VarBinary, 0xFFFF),
        column('c', dataTypeByName.VarBinary, 0xFFFF)
      ];

      const buffer = new WritableTrackingBuffer();
      buffer.writeUInt8(0xD2);
      buffer.writeUInt8(0b00000011); // `a` and `b` are null
      writePLP(buffer, Buffer.from('abc'), 2);

      const tokens = parseByteByByte(buffer.data, colMetadata, true);

      assert.deepEqual(summarize(tokens), [
        'ROW_START',
        ['COLUMN_VALUE', 0, null],
        ['COLUMN_VALUE', 1, null],
        ['VALUE_START', 2, 3],
        ['VALUE_DATA', Buffer.from('abc')],
        'VALUE_END',
        'ROW_END'
      ]);
    });

    it('hands out value chunks without copying the incoming data', function() {
      const buffer = new WritableTrackingBuffer();
      buffer.writeUInt8(0xD1);
      writePLP(buffer, Buffer.from('hello world'), 100);
      const data = buffer.data;

      const parser = new Parser(options, [column('a', dataTypeByName.VarBinary, 0xFFFF)]);
      parser.streamValues = true;
      parser.write(data);

      const tokens = readAll(parser);
      const chunk = tokens.find((token) => token instanceof ValueChunkToken) as ValueChunkToken;

      assert.strictEqual(chunk.data.buffer, data.buffer);
      assert.strictEqual(chunk.data.toString(), 'hello world');
    });

    it('applies changes of `streamValues` to the following rows', function() {
      const colMetadata = [column('a', dataTypeByName.Int)];

      const buffer = new WritableTrackingBuffer();
      for (let i = 0; i < 2; i++) {
        buffer.writeUInt8(0xD1);
        buffer.writeInt32LE(i);
      }

      const parser = new Parser(options, colMetadata);
      parser.write(buffer.data);

      assert.instanceOf(parser.read(), RowToken);

      parser.streamValues = true;
      assert.deepEqual(summarize(readAll(parser)), ['ROW_START', ['COLUMN_VALUE', 0, 1], 'ROW_END']);

      parser.end();
    });

    it('throws on `end` if the data ended in the middle of a streamed value', function() {
      const buffer = new WritableTrackingBuffer();
      buffer.writeUInt8(0xD1);
      writePLP(buffer, Buffer.from('hello world'), 100);

      const parser = new Parser(options, [column('a', dataTypeByName.VarBinary, 0xFFFF)]);
      parser.streamValues = true;
      parser.write(buffer.data.subarray(0, 20));
      readAll(parser);

      assert.throws(() => {
        parser.end();
      }, 'unexpected end of data');
    });

    it('can pipe streamed values into a `Readable`', async function() {
      const value = Buffer.alloc(100_000, 'x');

      const buffer = new WritableTrackingBuffer();
      buffer.writeUInt8(0xD1);
      writePLP(buffer, value, 8000);

      const parser = new Parser(options, [column('a', dataTypeByName.VarBinary, 0xFFFF)]);
      parser.streamValues = true;

      let stream: Readable | undefined;
      for (let offset = 0; offset < buffer.data.length; offset += 4096) {
        parser.write(buffer.data.subarray(offset, offset + 4096));

        let token;
        while ((token = parser.read()) !== undefined) {
          if (token instanceof ValueStartToken) {
            stream = new Readable({ read() {} });
          } else if (token instanceof ValueChunkToken) {
            stream!.push(token.data);
          } else if (token.name === 'VALUE_END') {
            stream!.push(null);
          }
        }
      }
      parser.end();

      const chunks = [];
      for await (const chunk of stream!) {
        chunks.push(chunk);
      }

      assert.deepEqual(Buffer.concat(chunks), value);
    });
  });
});
