var ReadableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer')
  .ReadableTrackingBuffer;
var WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer')
  .WritableTrackingBuffer;

exports.readableTrackingBuffer = function(test) {
  var buffer = new ReadableTrackingBuffer();

  test.ok(buffer);
  test.done();
};

exports.writableTrackingBuffer = function(test) {
  var buffer = new WritableTrackingBuffer(1);

  test.ok(buffer);
  test.done();
};
