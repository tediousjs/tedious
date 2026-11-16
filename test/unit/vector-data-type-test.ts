import { assert } from 'chai';

import { TYPE, TYPES, typeByName, resolveParameter, type DataType, type ParameterData, type Parameter } from '../../src/data-type';
import { type InternalConnectionOptions } from '../../src/connection';
import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';
import {
  Vector,
  VectorFloat16,
  decodeVector,
  fromFloat16Bits,
  requiredVectorSupportVersion,
  toFloat16Bits,
  vectorDimensionsFromTypeInfo,
  vectorTypeForDimensionType
} from '../../src/data-types/vector';

function hex(...parts: string[]) {
  return Buffer.from(parts.join(''), 'hex');
}

const options = {} as InternalConnectionOptions;

function typeInfo(type: DataType, parameter: ParameterData) {
  const buffer = new WritableTrackingBuffer();
  type.writeTypeInfo(buffer, parameter, options);
  return buffer.data;
}

function value(type: DataType, parameter: ParameterData) {
  const buffer = new WritableTrackingBuffer();
  assert.isUndefined(type.writeValue(buffer, parameter, options));
  return buffer.data;
}

function parameter(type: DataType, value: unknown, extra: Partial<Parameter> = {}): Parameter {
  return { type, name: 'p', value, output: false, ...extra };
}

// [1, 2.5, -3] as float32: header, then three little-endian float32 values.
const FLOAT32_PAYLOAD = hex('a901030000000000', '0000803f', '00002040', '000040c0');
// [1, 2.5, -3] as float16.
const FLOAT16_PAYLOAD = hex('a901030001000000', '003c', '0041', '00c2');

describe('Vector data types', function() {
  describe('registration', function() {
    it('exposes `TYPES.Vector` and `TYPES.VectorFloat16`', function() {
      assert.strictEqual(TYPES.Vector, Vector);
      assert.strictEqual(TYPES.VectorFloat16, VectorFloat16);
      assert.strictEqual(typeByName.Vector, Vector);
      assert.strictEqual(typeByName.VectorFloat16, VectorFloat16);
    });

    it('identifies the VECTORTYPE (0xF5) type id', function() {
      assert.strictEqual(Vector.id, 0xF5);
      assert.strictEqual(VectorFloat16.id, 0xF5);
      assert.strictEqual(Vector.type, 'VECTOR');
      assert.strictEqual(Vector.name, 'Vector');
      assert.strictEqual(VectorFloat16.name, 'VectorFloat16');
      assert.strictEqual(TYPE[0xF5], Vector);
    });

    it('maps dimension types to data types', function() {
      assert.strictEqual(vectorTypeForDimensionType(0x00), Vector);
      assert.strictEqual(vectorTypeForDimensionType(0x01), VectorFloat16);
      assert.throws(() => vectorTypeForDimensionType(0x02), 'Unsupported vector dimension type 0x02');
    });

    it('reports the required VECTORSUPPORT version', function() {
      assert.strictEqual(requiredVectorSupportVersion(Vector), 1);
      assert.strictEqual(requiredVectorSupportVersion(VectorFloat16), 2);
      assert.strictEqual(requiredVectorSupportVersion(TYPES.VarBinary), 0);
    });
  });

  describe('.declaration', function() {
    it('declares the dimensions of the value', function() {
      assert.strictEqual(Vector.declaration(parameter(Vector, [1, 2, 3])), 'vector(3)');
      assert.strictEqual(VectorFloat16.declaration(parameter(VectorFloat16, [1, 2, 3])), 'vector(3, float16)');
    });

    it('declares the dimensions given as `length`', function() {
      assert.strictEqual(Vector.declaration(parameter(Vector, null, { length: 1998 })), 'vector(1998)');
      assert.strictEqual(VectorFloat16.declaration(parameter(VectorFloat16, undefined, { length: 3996, output: true })), 'vector(3996, float16)');
    });

    it('requires `length` for a null value', function() {
      assert.throws(() => Vector.declaration(parameter(Vector, null)), TypeError, 'must be specified with the `length` option');
      assert.throws(() => Vector.declaration(parameter(Vector, undefined, { output: true })), TypeError, 'must be specified with the `length` option');
    });
  });

  describe('.validate', function() {
    it('accepts null and undefined as null', function() {
      assert.isNull(Vector.validate(null, undefined));
      assert.isNull(Vector.validate(undefined, undefined));
    });

    it('accepts arrays of numbers and Float32Arrays as is', function() {
      const array = [0.5, -1, 1e-30];
      assert.strictEqual(Vector.validate(array, undefined), array);
      const float32 = new Float32Array([1, 2]);
      assert.strictEqual(VectorFloat16.validate(float32, undefined), float32);
      // Idempotent: a validated value validates again.
      assert.strictEqual(Vector.validate(Vector.validate(array, undefined), undefined), array);
    });

    it('rejects values that are not vectors', function() {
      for (const invalid of ['[1, 2, 3]', 1, {}, Buffer.from([1, 2]), new Float64Array([1]), new Uint8Array([1]), new Set([1])]) {
        assert.throws(() => Vector.validate(invalid, undefined), TypeError, 'must be an array of numbers or a Float32Array');
      }
    });

    it('rejects elements that are not finite numbers, naming their index', function() {
      assert.throws(() => Vector.validate([1, '2'], undefined), TypeError, 'the element at index 1 is not a number');
      assert.throws(() => Vector.validate([1, 2n], undefined), TypeError, 'the element at index 1 is not a number');
      assert.throws(() => Vector.validate([null], undefined), TypeError, 'the element at index 0 is not a number');
      assert.throws(() => Vector.validate([1, , 3], undefined), TypeError, 'the element at index 1 is not a number');
      assert.throws(() => Vector.validate([NaN], undefined), TypeError, 'the element at index 0 is not a finite number');
      assert.throws(() => Vector.validate([0, Infinity], undefined), TypeError, 'the element at index 1 is not a finite number');
      assert.throws(() => VectorFloat16.validate([-Infinity], undefined), TypeError, 'the element at index 0 is not a finite number');
    });

    it('rejects elements that overflow the element type', function() {
      assert.doesNotThrow(() => Vector.validate([3.4028234663852886e38, -3.4028234663852886e38], undefined));
      assert.throws(() => Vector.validate([1, 1e39], undefined), TypeError, 'the element at index 1 is out of range for float32');

      assert.doesNotThrow(() => VectorFloat16.validate([65504, -65504, 65519.99], undefined));
      assert.throws(() => VectorFloat16.validate([65520], undefined), TypeError, 'the element at index 0 is out of range for float16');
      assert.throws(() => VectorFloat16.validate([-70000], undefined), TypeError, 'out of range for float16');
    });

    it('validates the number of dimensions', function() {
      assert.throws(() => Vector.validate([], undefined), TypeError, 'at least one dimension');
      assert.doesNotThrow(() => Vector.validate(new Array(1998).fill(0), undefined));
      assert.throws(() => Vector.validate(new Array(1999).fill(0), undefined), TypeError, 'at most 1998 dimensions, but 1999 were given');
      assert.doesNotThrow(() => VectorFloat16.validate(new Array(3996).fill(0), undefined));
      assert.throws(() => VectorFloat16.validate(new Array(3997).fill(0), undefined), TypeError, 'at most 3996 dimensions');
    });
  });

  describe('.resolve', function() {
    it('infers the dimensions from the value', function() {
      const resolved = resolveParameter(parameter(Vector, [1, 2, 3]), undefined, options);
      assert.deepEqual(resolved.data, { value: [1, 2, 3], length: 3 });
    });

    it('takes the dimensions from `length`', function() {
      assert.deepEqual(resolveParameter(parameter(Vector, [1, 2], { length: 2 }), undefined, options).data, { value: [1, 2], length: 2 });
      assert.deepEqual(resolveParameter(parameter(VectorFloat16, null, { length: 7 }), undefined, options).data, { value: null, length: 7 });
    });

    it('rejects a value whose dimensions do not match `length`', function() {
      assert.throws(() => resolveParameter(parameter(Vector, [1, 2], { length: 3 }), undefined, options), TypeError, 'the value has 2 dimension(s), but 3 were declared');
    });

    it('rejects invalid `length`s', function() {
      assert.throws(() => resolveParameter(parameter(Vector, null, { length: 0 }), undefined, options), TypeError, 'at least one dimension');
      assert.throws(() => resolveParameter(parameter(Vector, null, { length: 1.5 }), undefined, options), TypeError, 'at least one dimension');
      assert.throws(() => resolveParameter(parameter(Vector, null, { length: 1999 }), undefined, options), TypeError, 'at most 1998 dimensions');
    });

    it('rejects a null value without `length`', function() {
      assert.throws(() => resolveParameter(parameter(Vector, null), undefined, options), TypeError, 'must be specified with the `length` option');
    });

    it('validates the value', function() {
      assert.throws(() => resolveParameter(parameter(Vector, [NaN]), undefined, options), TypeError, 'not a finite number');
    });
  });

  describe('.resolveLength', function() {
    it('requires a length for a column without a value', function() {
      assert.strictEqual(Vector.resolveLength!(parameter(Vector, null, { length: 5 })), 5);
      assert.throws(() => Vector.resolveLength!(parameter(Vector, null)), TypeError, 'must be specified with the `length` option');
    });
  });

  describe('.writeTypeInfo', function() {
    it('writes the type id, maximum length and dimension type', function() {
      assert.deepEqual(typeInfo(Vector, { value: null, length: 3 }), Buffer.from([0xF5, 0x14, 0x00, 0x00]));
      assert.deepEqual(typeInfo(VectorFloat16, { value: null, length: 3 }), Buffer.from([0xF5, 0x0E, 0x00, 0x01]));
      assert.deepEqual(typeInfo(Vector, { value: undefined, length: 1998 }), Buffer.from([0xF5, 0x40, 0x1F, 0x00]));
      assert.deepEqual(typeInfo(VectorFloat16, { value: undefined, length: 3996 }), Buffer.from([0xF5, 0x40, 0x1F, 0x01]));
    });

    it('requires valid dimensions', function() {
      assert.throws(() => typeInfo(Vector, { value: undefined }), TypeError, 'must be specified with the `length` option');
      assert.throws(() => typeInfo(Vector, { value: undefined, length: 0 }), TypeError, 'at least one dimension');
    });
  });

  describe('.writeValue', function() {
    it('writes a null value as a 0xFFFF length', function() {
      assert.deepEqual(value(Vector, { value: null, length: 3 }), Buffer.from([0xFF, 0xFF]));
      assert.deepEqual(value(VectorFloat16, { value: undefined, length: 3 }), Buffer.from([0xFF, 0xFF]));
    });

    it('writes the length, header and little-endian float32 elements', function() {
      const expected = Buffer.concat([Buffer.from([0x14, 0x00]), FLOAT32_PAYLOAD]);
      assert.deepEqual(value(Vector, { value: [1, 2.5, -3], length: 3 }), expected);
      assert.deepEqual(value(Vector, { value: new Float32Array([1, 2.5, -3]), length: 3 }), expected);
    });

    it('writes the length, header and little-endian float16 elements', function() {
      const expected = Buffer.concat([Buffer.from([0x0E, 0x00]), FLOAT16_PAYLOAD]);
      assert.deepEqual(value(VectorFloat16, { value: [1, 2.5, -3], length: 3 }), expected);
    });

    it('rounds elements to the element type', function() {
      assert.deepEqual(value(Vector, { value: [0.1], length: 1 }).subarray(10), Buffer.from([0xCD, 0xCC, 0xCC, 0x3D]));
      assert.deepEqual(value(VectorFloat16, { value: [0.1], length: 1 }).subarray(10), Buffer.from([0x66, 0x2E]));
    });

    it('writes the dimension count of large vectors', function() {
      const data = value(VectorFloat16, { value: new Array(3996).fill(1), length: 3996 });
      assert.strictEqual(data.readUInt16LE(0), 8000);
      assert.strictEqual(data.readUInt16LE(4), 3996);
      assert.lengthOf(data, 8002);
    });

    it('rejects a value whose dimensions do not match the column', function() {
      assert.throws(() => value(Vector, { value: [1, 2], length: 3 }), TypeError, 'the value has 2 dimension(s), but 3 were declared');
    });
  });

  describe('decodeVector', function() {
    it('decodes float32 and float16 values', function() {
      assert.deepEqual(decodeVector(FLOAT32_PAYLOAD, 0x00), [1, 2.5, -3]);
      assert.deepEqual(decodeVector(FLOAT16_PAYLOAD, 0x01), [1, 2.5, -3]);
    });

    it('round-trips what `writeValue` writes', function() {
      const elements = [0.1, -123.456, 1e-20, 3.4e38, 0];
      const float32 = value(Vector, { value: elements, length: elements.length }).subarray(2);
      assert.deepEqual(decodeVector(float32, 0x00), elements.map(Math.fround));

      const halves = [0.1, -123.456, 65504, 6e-8, -0];
      const float16 = value(VectorFloat16, { value: halves, length: halves.length }).subarray(2);
      assert.deepEqual(decodeVector(float16, 0x01), halves.map((element) => fromFloat16Bits(toFloat16Bits(element))));
    });

    it('rejects values shorter than the header', function() {
      assert.throws(() => decodeVector(Buffer.from([0xA9, 0x01, 0x00]), 0x00), 'expected at least 8 bytes, but got 3');
    });

    it('rejects unknown layouts', function() {
      const wrongFormat = Buffer.from(FLOAT32_PAYLOAD);
      wrongFormat[0] = 0xA8;
      assert.throws(() => decodeVector(wrongFormat, 0x00), 'Unsupported vector layout 0xa8 version 1');

      const wrongVersion = Buffer.from(FLOAT32_PAYLOAD);
      wrongVersion[1] = 0x02;
      assert.throws(() => decodeVector(wrongVersion, 0x00), 'Unsupported vector layout 0xa9 version 2');
    });

    it('rejects a dimension type that does not match the column', function() {
      assert.throws(() => decodeVector(FLOAT16_PAYLOAD, 0x00), 'dimension type 0x1 does not match the column\'s dimension type 0x0');
      assert.throws(() => decodeVector(FLOAT32_PAYLOAD, 0x07), 'Unsupported vector dimension type 0x07');
    });

    it('rejects a length that does not match the dimension count', function() {
      assert.throws(() => decodeVector(FLOAT32_PAYLOAD.subarray(0, 18), 0x00), '3 float32 dimension(s) require 20 bytes, but got 18');
      assert.throws(() => decodeVector(Buffer.concat([FLOAT16_PAYLOAD, Buffer.from([0, 0])]), 0x01), '3 float16 dimension(s) require 14 bytes, but got 16');
    });
  });

  describe('vectorDimensionsFromTypeInfo', function() {
    it('derives the dimension count from the maximum length', function() {
      assert.strictEqual(vectorDimensionsFromTypeInfo(20, 0x00), 3);
      assert.strictEqual(vectorDimensionsFromTypeInfo(14, 0x01), 3);
      assert.strictEqual(vectorDimensionsFromTypeInfo(8000, 0x00), 1998);
    });

    it('rejects invalid lengths', function() {
      assert.throws(() => vectorDimensionsFromTypeInfo(8, 0x00), 'length 8 is not valid for float32 elements');
      assert.throws(() => vectorDimensionsFromTypeInfo(15, 0x00), 'length 15 is not valid for float32 elements');
      assert.throws(() => vectorDimensionsFromTypeInfo(11, 0x01), 'length 11 is not valid for float16 elements');
    });
  });

  describe('float16 conversion', function() {
    it('encodes well-known values', function() {
      const cases: Array<[number, number]> = [
        [0, 0x0000],
        [-0, 0x8000],
        [1, 0x3C00],
        [-2, 0xC000],
        [0.5, 0x3800],
        [65504, 0x7BFF],
        [0.1, 0x2E66],
        [1 / 3, 0x3555],
        [2 ** -14, 0x0400], // smallest normal
        [2 ** -24, 0x0001], // smallest subnormal
        [2 ** -14 - 2 ** -24, 0x03FF], // largest subnormal
        [Infinity, 0x7C00],
        [-Infinity, 0xFC00]
      ];
      for (const [number, bits] of cases) {
        assert.strictEqual(toFloat16Bits(number), bits, `${number}`);
      }
      assert.strictEqual(toFloat16Bits(NaN) & 0x7C00, 0x7C00);
      assert.notStrictEqual(toFloat16Bits(NaN) & 0x03FF, 0);
    });

    it('rounds to nearest, ties to even', function() {
      // Halfway between 1 (0x3C00) and the next float16: rounds down to even.
      assert.strictEqual(toFloat16Bits(1 + 2 ** -11), 0x3C00);
      // Halfway between 0x3C01 and 0x3C02: rounds up to even.
      assert.strictEqual(toFloat16Bits(1 + 3 * 2 ** -11), 0x3C02);
      assert.strictEqual(toFloat16Bits(1 + 2 ** -11 + 2 ** -30), 0x3C01);
      // Subnormals tie to even as well.
      assert.strictEqual(toFloat16Bits(2 ** -25), 0x0000);
      assert.strictEqual(toFloat16Bits(3 * 2 ** -25), 0x0002);
      // Rounding up into the next binade, and overflow.
      assert.strictEqual(toFloat16Bits(2 - 2 ** -12), 0x4000);
      assert.strictEqual(toFloat16Bits(65519), 0x7BFF);
      assert.strictEqual(toFloat16Bits(65520), 0x7C00);
    });

    it('round-trips every float16 value', function() {
      for (let bits = 0; bits <= 0xFFFF; bits++) {
        const number = fromFloat16Bits(bits);
        if (Number.isNaN(number)) {
          assert.strictEqual(bits & 0x7C00, 0x7C00);
          continue;
        }
        if (toFloat16Bits(number) !== bits) {
          assert.fail(`0x${bits.toString(16)} decoded to ${number}, which encoded to 0x${toFloat16Bits(number).toString(16)}`);
        }
      }
    });

    it('matches `Math.f16round` where available', function() {
      const f16round = (Math as { f16round?: (value: number) => number }).f16round;
      if (typeof f16round !== 'function') {
        this.skip();
      }

      for (let i = 0; i < 100000; i++) {
        const number = (Math.random() - 0.5) * 2 ** (Math.random() * 40 - 25);
        assert.strictEqual(fromFloat16Bits(toFloat16Bits(number)), f16round(number), `${number}`);
      }
    });
  });
});
