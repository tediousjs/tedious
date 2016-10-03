'use strict';

var TrackingBuffer, assertBuffer;

TrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer;

exports.create = function(test) {
  var buffer;
  buffer = new TrackingBuffer(2);
  test.ok(buffer);
  test.strictEqual(0, buffer.data.length);
  return test.done();
};

exports.writeUnsignedInt = function(test) {
  var buffer;
  buffer = new TrackingBuffer(20);
  buffer.writeUInt8(1);
  buffer.writeUInt16LE(2);
  buffer.writeUInt16BE(3);
  buffer.writeUInt32LE(4);
  buffer.writeUInt32BE(5);
  buffer.writeUInt64LE(0x600000007);
  assertBuffer(test, buffer, [0x01, 0x02, 0x00, 0x00, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x05, 0x07, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00]);
  return test.done();
};

exports.writeSignedInt = function(test) {
  var buffer;
  buffer = new TrackingBuffer(2);
  buffer.writeInt8(-1);
  buffer.writeInt16LE(-2);
  buffer.writeInt16BE(-3);
  buffer.writeInt32LE(-4);
  buffer.writeInt32BE(-5);
  buffer.writeInt64LE(-3500000000);
  assertBuffer(test, buffer, [0xFF, 0xFE, 0xFF, 0xFF, 0xFD, 0xFC, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFB, 0x00, 0x3d, 0x62, 0x2f, 0xff, 0xff, 0xff, 0xff]);
  return test.done();
};

exports.writeString = function(test) {
  var buffer;
  buffer = new TrackingBuffer(2, 'ucs2');
  buffer.writeString('abc');
  assertBuffer(test, buffer, [0x61, 0x00, 0x62, 0x00, 0x63, 0x00]);
  return test.done();
};

exports.writeBVarchar = function(test) {
  var buffer;
  buffer = new TrackingBuffer(2, 'ucs2');
  buffer.writeBVarchar('abc');
  assertBuffer(test, buffer, [0x03, 0x61, 0x00, 0x62, 0x00, 0x63, 0x00]);
  return test.done();
};

exports.writeUsVarchar = function(test) {
  var buffer;
  buffer = new TrackingBuffer(2, 'ucs2');
  buffer.writeUsVarchar('abc');
  assertBuffer(test, buffer, [0x03, 0x00, 0x61, 0x00, 0x62, 0x00, 0x63, 0x00]);
  return test.done();
};

exports.copyFrom = function(test) {
  var buffer, source;
  buffer = new TrackingBuffer(10);
  source = new Buffer([0x01, 0x02, 0x03, 0x04]);
  buffer.copyFrom(source);
  buffer.writeUInt8(5);
  assertBuffer(test, buffer, [0x01, 0x02, 0x03, 0x04, 0x05]);
  return test.done();
};

assertBuffer = function(test, actual, expected) {
  var comparisonResult;
  actual = actual.data;
  expected = new Buffer(expected);
  comparisonResult = actual.equals(expected);
  if (!comparisonResult) {
    console.log('actual  ', actual);
    console.log('expected', expected);
    return test.ok(false);
  }
};
