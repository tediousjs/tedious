'use strict';

var ReadableTrackingBuffer, WritableTrackingBuffer;

ReadableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').ReadableTrackingBuffer;

WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer;

exports.readableTrackingBuffer = function(test) {
  var buffer;
  buffer = new ReadableTrackingBuffer();
  test.ok(buffer);
  return test.done();
};

exports.writableTrackingBuffer = function(test) {
  var buffer;
  buffer = new WritableTrackingBuffer(1);
  test.ok(buffer);
  return test.done();
};
