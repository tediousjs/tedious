import { assert } from 'chai';

import { type InternalConnectionOptions } from '../../src/connection';
import { resolveParameter, type Parameter, type ParameterData } from '../../src/data-type';
import Vector, { decodeVector, vectorBaseTypeFromDimensionType, vectorDimensionsFromTypeInfo } from '../../src/data-types/vector';
import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';

const options = { tdsVersion: '7_4' } as InternalConnectionOptions;
const Float16Array = (globalThis as { Float16Array?: new (values: number[]) => ArrayLike<number> }).Float16Array;

function resolve(value: unknown, details: Pick<Parameter, 'baseType' | 'length'> = {}) {
  return resolveParameter({ type: Vector, name: 'v', output: false, value, ...details }, undefined, options).data;
}

function serialize(parameter: ParameterData) {
  const buffer = new WritableTrackingBuffer();
  Vector.writeTypeInfo(buffer, parameter, options);
  Vector.writeValue(buffer, parameter, options);
  return buffer.data;
}

describe('Vector data type', function() {
  it('writes and reads float32 values', function() {
    const value = new Float32Array([1, 2.5, -3]);
    const data = serialize(resolve(value));

    assert.strictEqual(data.toString('hex'), 'f51400001400a9010300000000000000803f00002040000040c0');
    assert.strictEqual(vectorBaseTypeFromDimensionType(data[3]), 'float32');
    assert.strictEqual(vectorDimensionsFromTypeInfo(data.readUInt16LE(1), data[3]), 3);

    const decoded = decodeVector(data.subarray(6), 'float32');
    assert.instanceOf(decoded, Float32Array);
    assert.deepEqual(Array.from(decoded), [1, 2.5, -3]);
  });

  it('writes and reads float16 values', function() {
    if (!Float16Array) {
      this.skip();
    }

    const value = new Float16Array([1, 2.5, -3]);
    const data = serialize(resolve(value));

    assert.strictEqual(data.toString('hex'), 'f50e00010e00a901030001000000003c004100c2');
    assert.strictEqual(vectorBaseTypeFromDimensionType(data[3]), 'float16');
    assert.strictEqual(vectorDimensionsFromTypeInfo(data.readUInt16LE(1), data[3]), 3);

    const decoded = decodeVector(data.subarray(6), 'float16');
    assert.instanceOf(decoded, Float16Array);
    assert.deepEqual(Array.from(decoded), [1, 2.5, -3]);
  });

  it('writes NULL vectors using the base type option', function() {
    assert.strictEqual(serialize(resolve(null, { length: 3 })).toString('hex'), 'f5140000ffff');
    assert.strictEqual(serialize(resolve(null, { length: 3, baseType: 'float16' })).toString('hex'), 'f50e0001ffff');
  });

  for (const [name, data, message] of [
    ['truncated header', 'a901', 'expected at least 8 bytes'],
    ['unknown layout', 'a8010100000000000000803f', 'Unsupported vector layout'],
    ['unknown layout version', 'a9020100000000000000803f', 'Unsupported vector layout'],
    ['mismatched dimension type', 'a901010001000000003c', 'does not match the column\'s dimension type'],
    ['truncated elements', 'a9010200000000000000803f', 'require 16 bytes, but got 12'],
    ['trailing bytes', 'a9010100000000000000803f00', 'require 12 bytes, but got 13']
  ]) {
    it(`rejects a value with ${name}`, function() {
      assert.throws(() => decodeVector(Buffer.from(data, 'hex'), 'float32'), message);
    });
  }

  it('rejects invalid TYPE_INFO', function() {
    assert.throws(() => vectorBaseTypeFromDimensionType(2), 'Unsupported vector dimension type');
    assert.throws(() => vectorDimensionsFromTypeInfo(8, 0), 'Invalid vector TYPE_INFO');
    assert.throws(() => vectorDimensionsFromTypeInfo(11, 1), 'Invalid vector TYPE_INFO');
  });

  const invalidParameters: Array<[string, unknown, Pick<Parameter, 'baseType' | 'length'>, string]> = [
    ['number array', [1, 2], {}, 'must be a Float32Array or a Float16Array'],
    ['other typed array', new Float64Array([1]), {}, 'must be a Float32Array or a Float16Array'],
    ['empty vector', new Float32Array(), {}, 'must have at least one dimension'],
    ['NaN element', new Float32Array([NaN]), {}, 'not a finite number'],
    ['infinite element', new Float32Array([Infinity]), {}, 'not a finite number'],
    ['missing dimensions for NULL', null, {}, 'must be specified with the `length` option'],
    ['non-integer dimension count', null, { length: 1.5 }, 'must have at least one dimension'],
    ['mismatched dimension count', new Float32Array([1, 2]), { length: 3 }, 'the value has 2 dimension(s), but 3 were declared'],
    ['too many float32 dimensions', new Float32Array(1999), {}, 'at most 1998 dimensions'],
    ['too many float16 dimensions', null, { length: 3997, baseType: 'float16' }, 'at most 3996 dimensions'],
    ['mismatched base type', new Float32Array([1]), { baseType: 'float16' }, 'a float32 value does not match the float16 base type']
  ];

  for (const [name, value, details, message] of invalidParameters) {
    it(`rejects a parameter with ${name}`, function() {
      assert.throws(() => resolve(value, details), TypeError, message);
    });
  }

  it('rejects an invalid base type at runtime', function() {
    assert.throws(() => resolve(new Float32Array([1]), { baseType: 'float64' as Parameter['baseType'] }), TypeError, 'Invalid vector base type');
  });

  it('validates bulk and TVP cells against the column dimensions and base type', function() {
    const buffer = new WritableTrackingBuffer();

    assert.throws(() => Vector.writeValue(buffer, { value: new Float32Array([1, 2]), length: 1 }, options), TypeError, 'but 1 were declared');
    assert.throws(() => Vector.writeValue(buffer, { value: new Float32Array([1]), length: 1, baseType: 'float16' }, options), TypeError, 'does not match the float16 base type');
    assert.lengthOf(buffer.data, 0);
  });
});
