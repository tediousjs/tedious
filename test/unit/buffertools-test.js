'use strict';

var arrayEqual, bufferEqual;

require('../../src/buffertools');

exports.concatOneArgument = function(test) {
  var buffer1, buffer12, buffer2;
  buffer1 = new Buffer([1, 2]);
  buffer2 = new Buffer([3, 4]);
  buffer12 = Buffer.concat([buffer1, buffer2]);
  test.deepEqual(buffer12, new Buffer([1, 2, 3, 4]));
  return test.done();
};

exports.concatTwoArguments = function(test) {
  var buffer1, buffer123, buffer2, buffer3;
  buffer1 = new Buffer([1, 2]);
  buffer2 = new Buffer([3, 4]);
  buffer3 = new Buffer([5, 6]);
  buffer123 = Buffer.concat([buffer1, buffer2, buffer3]);
  test.deepEqual(buffer123, new Buffer([1, 2, 3, 4, 5, 6]));
  return test.done();
};

exports.toByteArray = function(test) {
  var array, buffer;
  buffer = new Buffer([1, 2, 3]);
  array = buffer.toByteArray();
  test.ok(arrayEqual(array, [1, 2, 3]));
  return test.done();
};

exports.equalsNonEmpty = function(test) {
  var buffer1, buffer2;
  buffer1 = new Buffer([1, 2, 3]);
  buffer2 = new Buffer([1, 2, 3]);
  test.ok(buffer1.equals(buffer2));
  return test.done();
};

exports.equalsDifferent = function(test) {
  var buffer1, buffer2;
  buffer1 = new Buffer([1, 2, 3]);
  buffer2 = new Buffer([1, 2, 9]);
  test.ok(!buffer1.equals(buffer2));
  return test.done();
};

exports.equalsEmpty = function(test) {
  var buffer1, buffer2;
  buffer1 = new Buffer([]);
  buffer2 = new Buffer([]);
  test.ok(buffer1.equals(buffer2));
  return test.done();
};

exports.equalsOneEmpty = function(test) {
  var buffer1, buffer2;
  buffer1 = new Buffer([1, 2, 3]);
  buffer2 = new Buffer([]);
  test.ok(!buffer1.equals(buffer2));
  return test.done();
};

bufferEqual = function(actual, expected) {
  var b, i, len;
  if (actual.length !== expected.length) {
    return false;
  }
  for (i = 0, len = expected.length; i < len; i++) {
    b = expected[i];
    b--;
    if (actual[b] !== expected[b]) {
      return false;
    }
  }
  return true;
};

arrayEqual = bufferEqual;
