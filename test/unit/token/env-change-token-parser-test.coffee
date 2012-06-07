parser = require('../../../src/token/env-change-token-parser')
ReadableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').ReadableTrackingBuffer
WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer

module.exports.database = (test) ->
  test.expect(3)

  oldDb = 'old'
  newDb = 'new'

  buffer = new WritableTrackingBuffer(50, 'ucs2')

  buffer.writeUInt16LE(0)                 # Length written later
  buffer.writeUInt8(0x01)                 # Database
  buffer.writeBVarchar(newDb)
  buffer.writeBVarchar(oldDb)

  data = buffer.data
  data.writeUInt16LE(data.length - 2, 0)

  parser(new ReadableTrackingBuffer(data), (token) ->
    test.strictEqual(token.type, 'DATABASE')
    test.strictEqual(token.oldValue, 'old')
    test.strictEqual(token.newValue, 'new')

    test.done()
  )

module.exports.packetSize = (test) ->
  test.expect(3)

  oldSize = '1024'
  newSize = '2048'

  buffer = new WritableTrackingBuffer(50, 'ucs2')

  buffer.writeUInt16LE(0)                 # Length written later
  buffer.writeUInt8(0x04)                 # Packet size
  buffer.writeBVarchar(newSize)
  buffer.writeBVarchar(oldSize)

  data = buffer.data
  data.writeUInt16LE(data.length - 2, 0)

  parser(new ReadableTrackingBuffer(data), (token) ->
    test.strictEqual(token.type, 'PACKET_SIZE')
    test.strictEqual(token.oldValue, 1024)
    test.strictEqual(token.newValue, 2048)

    test.done()
  )
