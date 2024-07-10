const { assert } = require('chai');
const { typeByName: { Int, SmallInt, TinyInt, BigInt } } = require('../../src/data-type');

describe('integer-data-types', function() {
  describe('int data type test', function() {
    const params = [
      { param: { value: 8.9 }, expected: 8 },
      { param: { value: 0.000000000001 }, expected: 0 },
      { param: { value: 8.5 }, expected: 8 }
    ];

    params.forEach(function(item) {
      it('test valid parameter values', function() {
        const buffer = Buffer.concat([...Int.generateParameterData(item.param, {})]);
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
        const buffer = Buffer.concat([...SmallInt.generateParameterData(item.param, {})]);
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
        const buffer = Buffer.concat([...TinyInt.generateParameterData(item.param, {})]);
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
        const buffer = Buffer.concat([...BigInt.generateParameterData(item.param, {})]);
        assert.equal(buffer.readBigInt64LE(0), item.expected);
      });
    });
  });
});
