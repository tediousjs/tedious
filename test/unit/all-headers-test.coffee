WritableTrackingBuffer = require('../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer
require('../../src/buffertools')
writeAllHeaders = require('../../src/all-headers').writeToTrackingBuffer

exports.headers = (test) ->
  expected = new Buffer([
    0x16, 0x00, 0x00, 0x00,
    0x12, 0x00, 0x00, 0x00,
    0x02, 0x00,
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x01, 0x00, 0x00, 0x00
  ])

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  transactionDescriptor = new Buffer([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])
  writeAllHeaders(buffer, transactionDescriptor, 1);

  test.ok(buffer.data.equals(expected))

  test.done()
