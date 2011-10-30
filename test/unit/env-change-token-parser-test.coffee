parser = require('../../lib/env-change-token-parser')
TYPE = require('../../lib/token').TYPE

module.exports.tooShortToHoldTypeAndLengthValues = (test) ->
  buffer = new Buffer(3)

  token = parser(buffer, 1)

  test.ok(!token)
  test.done()

module.exports.tooShortForLength = (test) ->
  buffer = new Buffer(5)
  pos = 0;

  buffer.writeUInt8(TYPE.ENVCHANGE, pos); pos++
  buffer.writeUInt16LE(3, pos); pos += 2

  token = parser(buffer, 1)

  test.ok(!token)
  test.done()

module.exports.database = (test) ->
  oldDb = 'old'
  newDb = 'new'

  buffer = new Buffer(1 + 2 + 1 + 1 + (oldDb.length * 2) + 1 + (newDb.length * 2))
  pos = 0;

  buffer.writeUInt8(TYPE.ENVCHANGE, pos); pos++
  buffer.writeUInt16LE(buffer.length - (1 + 2), pos); pos += 2
  buffer.writeUInt8(0x01, pos); pos++ #Database
  buffer.writeUInt8(newDb.length, pos); pos++
  buffer.write(newDb, pos, 'ucs-2'); pos += (newDb.length * 2)
  buffer.writeUInt8(oldDb.length, pos); pos++
  buffer.write(oldDb, pos, 'ucs-2'); pos += (oldDb.length * 2)
  #console.log(buffer)

  token = parser(buffer, 1)

  test.strictEqual(token.length, buffer.length - 1)
  test.strictEqual(token.type, 'DATABASE')
  test.strictEqual(token.oldValue, 'old')
  test.strictEqual(token.newValue, 'new')

  test.done()

module.exports.packetSize = (test) ->
  oldSize = '1024'
  newSize = '2048'

  buffer = new Buffer(1 + 2 + 1 + 1 + (oldSize.length * 2) + 1 + (newSize.length * 2))
  pos = 0;

  buffer.writeUInt8(TYPE.ENVCHANGE, pos); pos++
  buffer.writeUInt16LE(buffer.length - (1 + 2), pos); pos += 2
  buffer.writeUInt8(0x04, pos); pos++ #Packet Size
  buffer.writeUInt8(newSize.length, pos); pos++
  buffer.write(newSize, pos, 'ucs-2'); pos += (newSize.length * 2)
  buffer.writeUInt8(oldSize.length, pos); pos++
  buffer.write(oldSize, pos, 'ucs-2'); pos += (oldSize.length * 2)
  #console.log(buffer)

  token = parser(buffer, 1)

  test.strictEqual(token.length, buffer.length - 1)
  test.strictEqual(token.type, 'PACKET_SIZE')
  test.strictEqual(token.oldValue, 1024)
  test.strictEqual(token.newValue, 2048)

  test.done()

module.exports.badType = (test) ->
  buffer = new Buffer(1 + 2 + 1)
  pos = 0;

  buffer.writeUInt8(TYPE.ENVCHANGE, pos); pos++
  buffer.writeUInt16LE(buffer.length - (1 + 2), pos); pos += 2
  buffer.writeUInt8(0xFF, pos); pos++ #Bad type
  #console.log(buffer)

  token = parser(buffer, 1)

  test.ok(token.error)

  test.done()
