'use strict';

var TrackingBuffer;

TrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').ReadableTrackingBuffer;

exports.createNoArgs = function(test) {
  var buffer;
  buffer = new TrackingBuffer();
  test.strictEqual(buffer.buffer.length, 0);
  test.strictEqual(buffer.encoding, 'utf8');
  return test.done();
};

exports.createWithBuffer = function(test) {
  var buffer, inputBuffer;
  inputBuffer = new Buffer([1, 2, 3]);
  buffer = new TrackingBuffer(inputBuffer);
  test.strictEqual(buffer.buffer, inputBuffer);
  test.strictEqual(buffer.encoding, 'utf8');
  return test.done();
};

exports.createWithEncoding = function(test) {
  var buffer, inputBuffer;
  inputBuffer = new Buffer([1, 2, 3]);
  buffer = new TrackingBuffer(inputBuffer, 'ucs2');
  test.strictEqual(buffer.buffer, inputBuffer);
  test.strictEqual(buffer.encoding, 'ucs2');
  return test.done();
};

exports.notEnoughLeft = function(test) {
  var buffer, error, inputBuffer;
  inputBuffer = new Buffer([1]);
  buffer = new TrackingBuffer(inputBuffer);
  try {
    buffer.readUInt16LE();
    test.ok(false);
  } catch (error1) {
    error = error1;
    test.strictEqual(error.code, 'oob');
  }
  return test.done();
};

exports.addBuffer = function(test) {
  var buffer, data, error;
  data = new Buffer([0x04, 0x00, 0x00, 0x00]);
  buffer = new TrackingBuffer(data.slice(0, 2));
  try {
    buffer.readUInt32LE();
    test.ok(false);
  } catch (error1) {
    error = error1;
    test.strictEqual(error.code, 'oob');
  }
  buffer.add(data.slice(2, 4));
  test.strictEqual(buffer.readUInt32LE(), 4);
  return test.done();
};

exports.readUnsignedInt = function(test) {
  var buffer, data;
  data = new Buffer([0x01, 0x02, 0x00, 0x00, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  buffer = new TrackingBuffer(data);
  test.strictEqual(buffer.readUInt8(), 1);
  test.strictEqual(buffer.readUInt16LE(), 2);
  test.strictEqual(buffer.readUInt16BE(), 3);
  test.strictEqual(buffer.readUInt32LE(), 4);
  test.strictEqual(buffer.readUInt32BE(), 5);
  test.strictEqual(buffer.readUInt64LE(), 6);
  return test.done();
};

exports.readSignedInt = function(test) {
  var buffer, data;
  data = new Buffer([0xFF, 0xFE, 0xFF, 0xFF, 0xFD, 0xFC, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFB]);
  buffer = new TrackingBuffer(data);
  test.strictEqual(buffer.readInt8(), -1);
  test.strictEqual(buffer.readInt16LE(), -2);
  test.strictEqual(buffer.readInt16BE(), -3);
  test.strictEqual(buffer.readInt32LE(), -4);
  test.strictEqual(buffer.readInt32BE(), -5);
  return test.done();
};

exports.readString = function(test) {
  var buffer, data;
  data = new Buffer([0x61, 0x00, 0x62, 0x00, 0x63, 0x00]);
  buffer = new TrackingBuffer(data, 'ucs2');
  test.strictEqual(buffer.readString(data.length), 'abc');
  return test.done();
};

exports.readBVarchar = function(test) {
  var buffer, data;
  data = new Buffer([0x03, 0x61, 0x00, 0x62, 0x00, 0x63, 0x00]);
  buffer = new TrackingBuffer(data, 'ucs2');
  test.strictEqual(buffer.readBVarchar(), 'abc');
  return test.done();
};

exports.readUsVarchar = function(test) {
  var buffer, data;
  data = new Buffer([0x03, 0x00, 0x61, 0x00, 0x62, 0x00, 0x63, 0x00]);
  buffer = new TrackingBuffer(data, 'ucs2');
  test.strictEqual(buffer.readUsVarchar(), 'abc');
  return test.done();
};

exports.readBuffer = function(test) {
  var buffer, data;
  data = new Buffer([0x01, 0x02, 0x03, 0x04]);
  buffer = new TrackingBuffer(data);
  buffer.readInt8();
  test.ok(buffer.readBuffer(2).equals(new Buffer([0x02, 0x03])));
  return test.done();
};

exports.readAsStringInt64LE = function(test) {
  var buffer, data;
  data = new Buffer([0x01, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  buffer = new TrackingBuffer(data);
  test.strictEqual(buffer.readAsStringInt64LE(), '513');
  return test.done();
};

exports.readRollback = function(test) {
  var buffer, data;
  data = new Buffer([0x01, 0x00, 0x02, 0x00, 0x03, 0x00]);
  buffer = new TrackingBuffer(data);
  test.strictEqual(buffer.readUInt16LE(), 1);
  test.strictEqual(buffer.readUInt16LE(), 2);
  buffer.rollback();
  test.strictEqual(buffer.readUInt16LE(), 2);
  test.strictEqual(buffer.readUInt16LE(), 3);
  return test.done();
};
