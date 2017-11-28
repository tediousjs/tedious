var WritableTrackingBuffer = require('../../src/tracking-buffer/writable-tracking-buffer');
var writeAllHeaders = require('../../src/all-headers').writeToTrackingBuffer;

exports.headers = function(test) {
  var expected = new Buffer([
    0x16,
    0x00,
    0x00,
    0x00,
    0x12,
    0x00,
    0x00,
    0x00,
    0x02,
    0x00,
    0x01,
    0x02,
    0x03,
    0x04,
    0x05,
    0x06,
    0x07,
    0x08,
    0x01,
    0x00,
    0x00,
    0x00
  ]);

  var buffer = new WritableTrackingBuffer(0, 'ucs2');
  var transactionDescriptor = new Buffer([
    0x01,
    0x02,
    0x03,
    0x04,
    0x05,
    0x06,
    0x07,
    0x08
  ]);
  writeAllHeaders(buffer, transactionDescriptor, 1);

  test.ok(buffer.data.equals(expected));

  test.done();
};
