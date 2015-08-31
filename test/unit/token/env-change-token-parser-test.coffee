Parser = require('../../../src/token/stream-parser')
WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer

module.exports.database = (test) ->
  oldDb = 'old'
  newDb = 'new'

  buffer = new WritableTrackingBuffer(50, 'ucs2')

  buffer.writeUInt8(0xE3)
  buffer.writeUInt16LE(0)                 # Length written later
  buffer.writeUInt8(0x01)                 # Database
  buffer.writeBVarchar(newDb)
  buffer.writeBVarchar(oldDb)

  data = buffer.data
  data.writeUInt16LE(data.length - 3, 1)

  parser = new Parser({ token: -> }, {}, {})
  parser.write(data)
  token = parser.read()

  test.strictEqual(token.type, 'DATABASE')
  test.strictEqual(token.oldValue, 'old')
  test.strictEqual(token.newValue, 'new')

  test.done()

module.exports.packetSize = (test) ->
  oldSize = '1024'
  newSize = '2048'

  buffer = new WritableTrackingBuffer(50, 'ucs2')

  buffer.writeUInt8(0xE3)
  buffer.writeUInt16LE(0)                 # Length written later
  buffer.writeUInt8(0x04)                 # Packet size
  buffer.writeBVarchar(newSize)
  buffer.writeBVarchar(oldSize)

  data = buffer.data
  data.writeUInt16LE(data.length - 3, 1)

  parser = new Parser({ token: -> }, {}, {})
  parser.write(data)
  token = parser.read()

  test.strictEqual(token.type, 'PACKET_SIZE')
  test.strictEqual(token.oldValue, 1024)
  test.strictEqual(token.newValue, 2048)

  test.done()

module.exports.badType = (test) ->
  buffer = new WritableTrackingBuffer(50, 'ucs2')

  buffer.writeUInt8(0xE3)
  buffer.writeUInt16LE(0)                 # Length written later
  buffer.writeUInt8(0xFF)                 # Bad type

  data = buffer.data
  data.writeUInt16LE(data.length - 3, 1);

  parser = new Parser({ token: -> }, {}, {})
  parser.write(data)
  token = parser.read()

  test.strictEqual(token, null)
  test.done()
