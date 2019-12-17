var Money = require('../../src/data-types/money');
var WritableTrackingBuffer = require('../../src/tracking-buffer/writable-tracking-buffer');

exports.TestValidMoneyValue = function(test) {
  const validValues = [-922337203685477.5, 922337203685477.5,
    -922337203685477.6 + 0.2, 922337203685477.6 - 0.2, 0, null];
  for (const value of validValues) {
    const value2 = Money.validate(value);
    test.equal(value, value2);

    test.doesNotThrow(function() {
      const value2 = Money.validate(value);
      test.equal(value, value2);
    });

    test.doesNotThrow(function() {
      const buf = new WritableTrackingBuffer(8);
      Money.writeParameterData(buf, { value: value });
    });
  }
  test.done();
};

exports.TestInvalidMoneyValue = function(test) {
  const invalidValues = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 922337203685477.6, 922337203685477.6];
  for (const value of invalidValues) {
    const ret = Money.validate(value);
    test.ok(ret instanceof TypeError);
  }
  test.done();
};
