ReadableTrackingBuffer = require('../../lib/tracking-buffer').ReadableTrackingBuffer
WritableTrackingBuffer = require('../../lib/tracking-buffer').WritableTrackingBuffer

exports.readableTrackingBuffer = (test) ->
  buffer = new ReadableTrackingBuffer()
  
  test.ok(buffer)
  test.done()

exports.writableTrackingBuffer = (test) ->
  buffer = new WritableTrackingBuffer()
  
  test.ok(buffer)
  test.done()
