ReadableTrackingBuffer = require('../../../lib/tracking-buffer/tracking-buffer').ReadableTrackingBuffer
WritableTrackingBuffer = require('../../../lib/tracking-buffer/tracking-buffer').WritableTrackingBuffer

exports.readableTrackingBuffer = (test) ->
  buffer = new ReadableTrackingBuffer()
  
  test.ok(buffer)
  test.done()

exports.writableTrackingBuffer = (test) ->
  buffer = new WritableTrackingBuffer(1)
  
  test.ok(buffer)
  test.done()
