require('buffertools')
TrackingBuffer = require('../../lib/tracking-buffer').ReadableTrackingBuffer

exports.createNoArgs = (test) ->
  buffer = new TrackingBuffer()
  
  test.strictEqual(buffer.buffer.length, 0)
  test.strictEqual(buffer.encoding, 'utf8')

  test.done()

exports.createWithBuffer = (test) ->
  inputBuffer = new Buffer([1 ,2, 3])
  buffer = new TrackingBuffer(inputBuffer)
  
  test.strictEqual(buffer.buffer, inputBuffer)
  test.strictEqual(buffer.encoding, 'utf8')

  test.done()

exports.createWithEncoding = (test) ->
  inputBuffer = new Buffer([1 ,2, 3])
  buffer = new TrackingBuffer(inputBuffer, 'ucs2')
  
  test.strictEqual(buffer.buffer, inputBuffer)
  test.strictEqual(buffer.encoding, 'ucs2')

  test.done()

# exports.readUnsignedInt = (test) ->
  # buffer = new TrackingBuffer([
    # 0x01
    # 0x02, 0x00
    # 0x00, 0x03
    # 0x04, 0x00, 0x00, 0x00
    # 0x00, 0x00, 0x00, 0x05
  # ])
# 
  # test.strictEqual(buffer.readUInt8(), 1)
  # test.strictEqual(buffer.readUInt16LE(), 2)
  # test.strictEqual(buffer.readUInt16BE(), 3)
  # test.strictEqual(buffer.readUInt32LE(), 4)
  # test.strictEqual(buffer.readUInt32BE(), 5)
# 
  # test.done()
