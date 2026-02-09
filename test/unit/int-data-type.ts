import { assert } from 'chai';
import { typeByName } from '../../src/data-type';
import { type InternalConnectionOptions } from '../../src/connection';

const { Int, SmallInt, TinyInt, BigInt } = typeByName;

// Test options - using type assertion since tests only exercise code paths
// that use a subset of the full InternalConnectionOptions
const options: InternalConnectionOptions = {} as InternalConnectionOptions;

describe('integer-data-types', function() {
  describe('int data type test', function() {
    const params = [
      { param: { value: 8.9 }, expected: 8 },
      { param: { value: 0.000000000001 }, expected: 0 },
      { param: { value: 8.5 }, expected: 8 }
    ];

    params.forEach(function(item) {
      it('test valid parameter values', function() {
        const buffer = Buffer.concat([...Int.generateParameterData(item.param, options)]);
        assert.equal(buffer.readInt32LE(0), item.expected);
      });
    });
  });

  describe('small int data type test', function() {
    const params = [
      { param: { value: 8.9 }, expected: 8 },
      { param: { value: 0.000000000001 }, expected: 0 },
      { param: { value: 8.5 }, expected: 8 }
    ];

    params.forEach(function(item) {
      it('test valid parameter values', function() {
        const buffer = Buffer.concat([...SmallInt.generateParameterData(item.param, options)]);
        assert.equal(buffer.readInt16LE(0), item.expected);
      });
    });
  });

  describe('tiny int data type test', function() {
    const params = [
      { param: { value: 8.9 }, expected: 8 },
      { param: { value: 0.000000000001 }, expected: 0 },
      { param: { value: 8.5 }, expected: 8 }
    ];

    params.forEach(function(item) {
      it('test valid parameter values', function() {
        const buffer = Buffer.concat([...TinyInt.generateParameterData(item.param, options)]);
        assert.equal(buffer.readInt8(0), item.expected);
      });
    });
  });

  describe('big int data type test', function() {
    const params = [
      { param: { value: 9223372036854775807n }, expected: 9223372036854775807n },
      { param: { value: -9223372036854775808n }, expected: -9223372036854775808n }
    ];

    params.forEach(function(item) {
      it('test valid parameter values', function() {
        const buffer = Buffer.concat([...BigInt.generateParameterData(item.param, options)]);
        assert.equal(buffer.readBigInt64LE(0), item.expected);
      });
    });
  });
});
