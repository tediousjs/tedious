const { assert } = require('chai');
const { typeByName: { Int, SmallInt, TinyInt } } = require('../../src/data-type');
const WritableTrackingBuffer = require('../../src/tracking-buffer/writable-tracking-buffer');

describe('integer-data-types', function() {
  describe('int data type test', function() {
    const params = [
      { param: { value: 8.9 }, expected: 8 },
      { param: { value: 0.000000000001 }, expected: 0 },
      { param: { value: 8.5 }, expected: 8 }
    ];

    params.forEach(function(item) {
      it('test valid parameter values', function(done) {
        const buffer = new WritableTrackingBuffer(4 + 1);

        Int.writeParameterData(buffer, item.param, {}, () => {
          assert.equal(buffer.buffer.readInt32LE(1), item.expected);

          done();
        });
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
      it('test valid parameter values', function(done) {
        const buffer = new WritableTrackingBuffer(4 + 1);

        SmallInt.writeParameterData(buffer, item.param, {}, () => {
          assert.equal(buffer.buffer.readInt32LE(1), item.expected);

          done();
        });
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
      it('test valid parameter values', function(done) {
        const buffer = new WritableTrackingBuffer(4 + 1);
        TinyInt.writeParameterData(buffer, item.param, {}, () => {
          assert.equal(buffer.buffer.readInt32LE(1), item.expected);

          done();
        });
      });
    });
  });
});
