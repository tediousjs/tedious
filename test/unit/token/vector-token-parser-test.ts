import { assert } from 'chai';

import StreamParser, { type ParserOptions } from '../../../src/token/stream-parser';
import { ColMetadataToken, NBCRowToken, ReturnValueToken, RowToken } from '../../../src/token/token';
import WritableTrackingBuffer from '../../../src/tracking-buffer/writable-tracking-buffer';
import { TYPES } from '../../../src/data-type';

function hex(...parts: string[]) {
  return Buffer.from(parts.join(''), 'hex');
}

const options = { tdsVersion: '7_4', useUTC: false, useColumnNames: false } as ParserOptions;

// [1, 2.5, -3]
const FLOAT32_VALUE = hex('a901030000000000', '0000803f', '00002040', '000040c0');
const FLOAT16_VALUE = hex('a901030001000000', '003c', '0041', '00c2');

function writeColumn(buffer: WritableTrackingBuffer, name: string, typeInfo: number[]) {
  buffer.writeUInt32LE(0); // UserType
  buffer.writeUInt16LE(0x0001); // Flags: nullable
  buffer.writeBuffer(Buffer.from(typeInfo));
  buffer.writeBVarchar(name, 'ucs2');
}

function writeVectorValue(buffer: WritableTrackingBuffer, value: Buffer | null) {
  if (value === null) {
    buffer.writeUInt16LE(0xFFFF);
  } else {
    buffer.writeUInt16LE(value.length);
    buffer.writeBuffer(value);
  }
}

// COLMETADATA for: v32 vector(3), v16 vector(3, float16), id int
function writeColMetadata(buffer: WritableTrackingBuffer) {
  buffer.writeUInt8(0x81);
  buffer.writeUInt16LE(3);
  writeColumn(buffer, 'v32', [0xF5, 0x14, 0x00, 0x00]);
  writeColumn(buffer, 'v16', [0xF5, 0x0E, 0x00, 0x01]);
  writeColumn(buffer, 'id', [0x26, 0x04]);
}

async function parseAll(chunks: Buffer[]) {
  const tokens = [];
  for await (const token of StreamParser.parseTokens(chunks, options)) {
    tokens.push(token);
  }
  return tokens;
}

describe('Vector token parsing', function() {
  describe('COLMETADATA', function() {
    it('parses vector column metadata', async function() {
      const buffer = new WritableTrackingBuffer();
      writeColMetadata(buffer);

      const [token] = await parseAll([buffer.data]);
      assert.instanceOf(token, ColMetadataToken);
      const [v32, v16, id] = (token as ColMetadataToken).columns;

      assert.strictEqual(v32.type, TYPES.Vector);
      assert.strictEqual(v32.dataLength, 20);
      assert.strictEqual(v32.precision, 3);
      assert.isUndefined(v32.scale);
      assert.isUndefined(v32.collation);
      assert.strictEqual(v32.colName, 'v32');

      assert.strictEqual(v16.type, TYPES.VectorFloat16);
      assert.strictEqual(v16.dataLength, 14);
      assert.strictEqual(v16.precision, 3);
      assert.strictEqual(v16.colName, 'v16');

      // The following column is parsed from the right offset.
      assert.strictEqual(id.type.name, 'IntN');
      assert.strictEqual(id.colName, 'id');
    });

    it('rejects an unknown dimension type', async function() {
      const buffer = new WritableTrackingBuffer();
      buffer.writeUInt8(0x81);
      buffer.writeUInt16LE(1);
      writeColumn(buffer, 'v', [0xF5, 0x14, 0x00, 0x02]);

      let error: Error | undefined;
      try {
        await parseAll([buffer.data]);
      } catch (err) {
        error = err as Error;
      }
      assert.instanceOf(error, Error);
      assert.include(error!.message, 'Unsupported vector dimension type 0x02');
    });

    it('rejects a maximum length that does not fit the dimension type', async function() {
      const buffer = new WritableTrackingBuffer();
      buffer.writeUInt8(0x81);
      buffer.writeUInt16LE(1);
      writeColumn(buffer, 'v', [0xF5, 0x13, 0x00, 0x00]);

      let error: Error | undefined;
      try {
        await parseAll([buffer.data]);
      } catch (err) {
        error = err as Error;
      }
      assert.instanceOf(error, Error);
      assert.include(error!.message, 'Invalid vector TYPE_INFO: length 19 is not valid for float32 elements');
    });
  });

  describe('ROW', function() {
    function buildRows() {
      const buffer = new WritableTrackingBuffer();
      writeColMetadata(buffer);

      buffer.writeUInt8(0xD1);
      writeVectorValue(buffer, FLOAT32_VALUE);
      writeVectorValue(buffer, FLOAT16_VALUE);
      buffer.writeUInt8(4);
      buffer.writeInt32LE(42);

      buffer.writeUInt8(0xD1);
      writeVectorValue(buffer, null);
      writeVectorValue(buffer, null);
      buffer.writeUInt8(0);

      return buffer.data;
    }

    it('parses vector values, including nulls, in mixed rows', async function() {
      const [, first, second] = await parseAll([buildRows()]);

      assert.instanceOf(first, RowToken);
      const columns = (first as RowToken).columns as Array<{ value: unknown }>;
      assert.deepEqual(columns.map((column) => column.value), [[1, 2.5, -3], [1, 2.5, -3], 42]);

      assert.instanceOf(second, RowToken);
      assert.deepEqual(((second as RowToken).columns as Array<{ value: unknown }>).map((column) => column.value), [null, null, null]);
    });

    it('parses vector values delivered one byte at a time', async function() {
      const data = buildRows();
      const chunks = [];
      for (let i = 0; i < data.length; i++) {
        chunks.push(data.subarray(i, i + 1));
      }

      const [, first, second] = await parseAll(chunks);
      assert.deepEqual(((first as RowToken).columns as Array<{ value: unknown }>).map((column) => column.value), [[1, 2.5, -3], [1, 2.5, -3], 42]);
      assert.deepEqual(((second as RowToken).columns as Array<{ value: unknown }>).map((column) => column.value), [null, null, null]);
    });

    it('rejects a malformed vector value', async function() {
      const buffer = new WritableTrackingBuffer();
      writeColMetadata(buffer);

      const malformed = Buffer.from(FLOAT32_VALUE);
      malformed.writeUInt16LE(4, 2); // 4 dimensions in 20 bytes

      buffer.writeUInt8(0xD1);
      writeVectorValue(buffer, malformed);
      writeVectorValue(buffer, null);
      buffer.writeUInt8(0);

      let error: Error | undefined;
      try {
        await parseAll([buffer.data]);
      } catch (err) {
        error = err as Error;
      }
      assert.instanceOf(error, Error);
      assert.include(error!.message, '4 float32 dimension(s) require 24 bytes, but got 20');
    });
  });

  describe('NBCROW', function() {
    it('parses vector values next to null bitmap nulls', async function() {
      const buffer = new WritableTrackingBuffer();
      writeColMetadata(buffer);

      buffer.writeUInt8(0xD2);
      buffer.writeUInt8(0b00000001); // v32 is null
      writeVectorValue(buffer, FLOAT16_VALUE);
      buffer.writeUInt8(4);
      buffer.writeInt32LE(7);

      const [, row] = await parseAll([buffer.data]);
      assert.instanceOf(row, NBCRowToken);
      assert.deepEqual(((row as NBCRowToken).columns as Array<{ value: unknown }>).map((column) => column.value), [null, [1, 2.5, -3], 7]);
    });
  });

  describe('RETURNVALUE', function() {
    function returnValue(typeInfo: number[], value: Buffer | null) {
      const buffer = new WritableTrackingBuffer();
      buffer.writeUInt8(0xAC);
      buffer.writeUInt16LE(1); // ParamOrdinal
      buffer.writeBVarchar('@out', 'ucs2');
      buffer.writeUInt8(0x01); // Status: output parameter
      buffer.writeUInt32LE(0); // UserType
      buffer.writeUInt16LE(0x0001); // Flags
      buffer.writeBuffer(Buffer.from(typeInfo));
      writeVectorValue(buffer, value);
      return buffer.data;
    }

    it('parses a vector output parameter', async function() {
      const [token] = await parseAll([returnValue([0xF5, 0x14, 0x00, 0x00], FLOAT32_VALUE)]);
      assert.instanceOf(token, ReturnValueToken);
      assert.strictEqual((token as ReturnValueToken).paramName, 'out');
      assert.strictEqual((token as ReturnValueToken).metadata.type, TYPES.Vector);
      assert.strictEqual((token as ReturnValueToken).metadata.precision, 3);
      assert.deepEqual((token as ReturnValueToken).value, [1, 2.5, -3]);
    });

    it('parses a float16 vector output parameter', async function() {
      const [token] = await parseAll([returnValue([0xF5, 0x0E, 0x00, 0x01], FLOAT16_VALUE)]);
      assert.strictEqual((token as ReturnValueToken).metadata.type, TYPES.VectorFloat16);
      assert.deepEqual((token as ReturnValueToken).value, [1, 2.5, -3]);
    });

    it('parses a null vector output parameter', async function() {
      const [token] = await parseAll([returnValue([0xF5, 0x14, 0x00, 0x00], null)]);
      assert.isNull((token as ReturnValueToken).value);
    });
  });
});
