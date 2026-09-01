import { assert } from 'chai';

import { typeByName as TYPES } from '../../src/data-type';
import { type InternalConnectionOptions } from '../../src/connection';
import StreamParser, { type ParserOptions } from '../../src/token/stream-parser';
import { ColMetadataToken, RowToken } from '../../src/token/token';
import Debug from '../../src/debug';

const options = {} as InternalConnectionOptions;
const parserOptions = { tdsVersion: '7_4', useUTC: true, useColumnNames: false } as ParserOptions;

function buildVectorValue(values: number[], { layoutFormat = 0xA9, layoutVersion = 0x01, dimensionType = 0x00, dimensions = values.length } = {}) {
  const buffer = Buffer.alloc(8 + (values.length * 4));
  buffer.writeUInt8(layoutFormat, 0);
  buffer.writeUInt8(layoutVersion, 1);
  buffer.writeUInt16LE(dimensions, 2);
  buffer.writeUInt8(dimensionType, 4);
  for (let i = 0; i < values.length; i++) {
    buffer.writeFloatLE(values[i], 8 + (i * 4));
  }
  return buffer;
}

function buildTokenStream(valueData: Buffer | null) {
  const name = Buffer.from('v', 'ucs2');
  const colMetadata = Buffer.alloc(14 + name.length);
  let offset = 0;
  offset = colMetadata.writeUInt8(0x81, offset); // COLMETADATA
  offset = colMetadata.writeUInt16LE(1, offset);
  offset = colMetadata.writeUInt32LE(0, offset); // userType
  offset = colMetadata.writeUInt16LE(0x0009, offset); // flags
  offset = colMetadata.writeUInt8(0xF5, offset); // VECTORTYPE
  offset = colMetadata.writeUInt16LE(valueData ? valueData.length : 8, offset);
  offset = colMetadata.writeUInt8(0x00, offset); // dimension type: float32
  offset = colMetadata.writeUInt8(name.length / 2, offset);
  name.copy(colMetadata, offset);

  const row = Buffer.alloc(3);
  row.writeUInt8(0xD1, 0); // ROW
  row.writeUInt16LE(valueData ? valueData.length : 0xFFFF, 1);

  return Buffer.concat(valueData ? [colMetadata, row, valueData] : [colMetadata, row]);
}

async function parseTokenStream(data: Buffer, chunkSize = data.length) {
  const chunks = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.subarray(i, Math.min(i + chunkSize, data.length)));
  }

  const parser = StreamParser.parseTokens(chunks, new Debug(), parserOptions);
  const tokens = [];
  for (let result = await parser.next(); !result.done; result = await parser.next()) {
    tokens.push(result.value);
  }
  return tokens;
}

describe('Vector parameter type', function() {
  describe('validate', function() {
    it('accepts a Float32Array', function() {
      const value = new Float32Array([1.5, -2.5, 3]);
      assert.strictEqual(TYPES.Vector.validate(value, undefined, options), value);
    });

    it('accepts null', function() {
      assert.isNull(TYPES.Vector.validate(null, undefined, options));
    });

    it('rejects an array of numbers', function() {
      assert.throws(() => {
        TYPES.Vector.validate([1.5, -2.5, 3], undefined, options);
      }, TypeError, /must be of type `Float32Array`/);
    });

    it('rejects an empty vector', function() {
      assert.throws(() => {
        TYPES.Vector.validate(new Float32Array(0), undefined, options);
      }, TypeError, /between 1 and 1998 dimensions/);
    });

    it('rejects a vector with too many dimensions', function() {
      assert.throws(() => {
        TYPES.Vector.validate(new Float32Array(1999), undefined, options);
      }, TypeError, /between 1 and 1998 dimensions/);
    });
  });

  describe('declaration', function() {
    it('uses the value for the dimension count', function() {
      const parameter = { type: TYPES.Vector, name: 'v', value: new Float32Array(3), output: false };
      assert.strictEqual(TYPES.Vector.declaration(parameter), 'vector(3)');
    });

    it('uses the given length for the dimension count', function() {
      const parameter = { type: TYPES.Vector, name: 'v', value: null, length: 1536, output: false };
      assert.strictEqual(TYPES.Vector.declaration(parameter), 'vector(1536)');
    });
  });

  describe('parameter serialization', function() {
    it('writes the type info with the byte length and dimension type', function() {
      const buffer = TYPES.Vector.generateTypeInfo({ value: new Float32Array(3), length: 3 }, options);
      assert.deepEqual(buffer, Buffer.from([0xF5, 0x14, 0x00, 0x00]));
    });

    it('writes the value with the vector header', function() {
      const value = new Float32Array([1.5, -2.5, 3]);

      const length = TYPES.Vector.generateParameterLength({ value, length: 3 }, options);
      assert.deepEqual(length, Buffer.from([0x14, 0x00]));

      const data = Buffer.concat([...TYPES.Vector.generateParameterData({ value, length: 3 }, options)]);
      assert.deepEqual(data, buildVectorValue([1.5, -2.5, 3]));
    });

    it('writes a null value', function() {
      const length = TYPES.Vector.generateParameterLength({ value: null, length: 3 }, options);
      assert.deepEqual(length, Buffer.from([0xFF, 0xFF]));

      const data = Buffer.concat([...TYPES.Vector.generateParameterData({ value: null, length: 3 }, options)]);
      assert.strictEqual(data.length, 0);
    });

    it('prefers the value over a mismatched explicit length', function() {
      // The type info and the value bytes must always agree.
      const buffer = TYPES.Vector.generateTypeInfo({ value: new Float32Array(5), length: 3 }, options);
      assert.deepEqual(buffer, Buffer.from([0xF5, 0x1C, 0x00, 0x00]));

      assert.strictEqual(TYPES.Vector.declaration({ type: TYPES.Vector, name: 'v', value: new Float32Array(5), length: 3, output: false }), 'vector(5)');
    });

    it('rejects an out of range explicit length', function() {
      assert.throws(() => {
        TYPES.Vector.generateTypeInfo({ value: null, length: 20000 }, options);
      }, TypeError, /between 1 and 1998 dimensions/);

      assert.throws(() => {
        TYPES.Vector.declaration({ type: TYPES.Vector, name: 'v', value: null, length: -1, output: false });
      }, TypeError, /between 1 and 1998 dimensions/);
    });
  });
});

describe('Vector value parser', function() {
  it('parses a vector value into a Float32Array', async function() {
    const [colMetadata, row] = await parseTokenStream(buildTokenStream(buildVectorValue([1.5, -2.5, 3])));

    assert.instanceOf(colMetadata, ColMetadataToken);
    assert.strictEqual((colMetadata as ColMetadataToken).columns[0].dataLength, 20);

    assert.instanceOf(row, RowToken);
    const value = (row as RowToken).columns[0].value;
    assert.instanceOf(value, Float32Array);
    assert.deepEqual(value, new Float32Array([1.5, -2.5, 3]));
  });

  it('parses a NULL vector value', async function() {
    const [, row] = await parseTokenStream(buildTokenStream(null));

    assert.instanceOf(row, RowToken);
    assert.isNull((row as RowToken).columns[0].value);
  });

  it('parses a vector value that arrives in single byte chunks', async function() {
    const [, row] = await parseTokenStream(buildTokenStream(buildVectorValue([1.5, -2.5, 3])), 1);

    assert.instanceOf(row, RowToken);
    assert.deepEqual((row as RowToken).columns[0].value, new Float32Array([1.5, -2.5, 3]));
  });

  it('parses a maximum size vector value', async function() {
    const values = Array.from({ length: 1998 }, (_, i) => i / 2);
    const [, row] = await parseTokenStream(buildTokenStream(buildVectorValue(values)), 4096);

    assert.instanceOf(row, RowToken);
    assert.deepEqual((row as RowToken).columns[0].value, new Float32Array(values));
  });

  it('rejects a value with an unsupported layout format', async function() {
    let error;
    try {
      await parseTokenStream(buildTokenStream(buildVectorValue([1.5], { layoutFormat: 0xAA })));
    } catch (err: any) {
      error = err;
    }

    assert.instanceOf(error, Error);
    assert.match(error.message, /Unsupported vector layout/);
  });

  it('rejects a value with an unsupported dimension type', async function() {
    let error;
    try {
      await parseTokenStream(buildTokenStream(buildVectorValue([1.5], { dimensionType: 0x01 })));
    } catch (err: any) {
      error = err;
    }

    assert.instanceOf(error, Error);
    assert.match(error.message, /Unsupported vector dimension type/);
  });

  it('rejects a value whose length does not match its dimension count', async function() {
    let error;
    try {
      await parseTokenStream(buildTokenStream(buildVectorValue([1.5, 2.5], { dimensions: 3 })));
    } catch (err: any) {
      error = err;
    }

    assert.instanceOf(error, Error);
    assert.match(error.message, /Invalid vector value length/);
  });
});
