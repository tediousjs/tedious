parser = require('../../../src/token/returnstatus-token-parser')
ReadableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').ReadableTrackingBuffer
WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer

module.exports.returnstatus = (test) ->
  status = 3

  buffer = new WritableTrackingBuffer(50, 'ucs2')

  buffer.writeUInt32LE(status)

  parser(new ReadableTrackingBuffer(buffer.data), (token) ->
    test.strictEqual(token.value, status)

    test.done()
  )
