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

exports.readUnsignedInt = (test) ->
  data = new Buffer([
    0x01
    0x02, 0x00
    0x00, 0x03
    0x04, 0x00, 0x00, 0x00
    0x00, 0x00, 0x00, 0x05
  ])

  buffer = new TrackingBuffer(data.slice(0, 2))

  test.strictEqual(buffer.readUInt8(), 1)

  test.strictEqual(buffer.readUInt16LE(), null)
  buffer.add(data.slice(2, 7))
  test.strictEqual(buffer.readUInt16LE(), 2)

  test.strictEqual(buffer.readUInt16BE(), 3)

  test.strictEqual(buffer.readUInt32LE(), null)
  buffer.add(data.slice(7))
  test.strictEqual(buffer.readUInt32LE(), 4)

  test.strictEqual(buffer.readUInt32BE(), 5)

  test.done()

exports.readSignedInt = (test) ->
  data = new Buffer([
    0xFF
    0xFE, 0xFF
    0xFF, 0xFD
    0xFC, 0xFF, 0xFF, 0xFF
    0xFF, 0xFF, 0xFF, 0xFB
  ])

  buffer = new TrackingBuffer(data.slice(0, 2))

  test.strictEqual(buffer.readInt8(), -1)

  test.strictEqual(buffer.readInt16LE(), null)
  buffer.add(data.slice(2, 7))
  test.strictEqual(buffer.readInt16LE(), -2)

  test.strictEqual(buffer.readInt16BE(), -3)

  test.strictEqual(buffer.readInt32LE(), null)
  buffer.add(data.slice(7))
  test.strictEqual(buffer.readInt32LE(), -4)

  test.strictEqual(buffer.readInt32BE(), -5)

  test.done()

exports.readString = (test) ->
  data = new Buffer([0x61, 0x00, 0x62, 0x00, 0x63, 0x00])
  buffer = new TrackingBuffer(data.slice(0, 2), 'ucs2')

  test.strictEqual(buffer.readString(data.length), null)
  buffer.add(data.slice(2))
  test.strictEqual(buffer.readString(data.length), 'abc')

  test.done()
