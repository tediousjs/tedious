Parser = require('../../lib/token-stream-parser').Parser
TYPE = require('../../lib/token').TYPE

module.exports.envChange = (test) ->
  buffer = createDbChangeBuffer()

  parser = new Parser()
  parser.addBuffer(buffer)

  test.ok(parser.end())

  test.done()

module.exports.tokenSplitAcrossBuffers = (test) ->
  buffer = createDbChangeBuffer()

  parser = new Parser()
  parser.addBuffer(buffer.slice(0,6))
  parser.addBuffer(buffer.slice(6))

  test.ok(parser.end())

  test.done()

createDbChangeBuffer = ->
  oldDb = 'old'
  newDb = 'new'

  buffer = new Buffer(1 + 2 + 1 + 1 + (oldDb.length * 2) + 1 + (newDb.length * 2))
  pos = 0;

  buffer.writeUInt8(TYPE.ENVCHANGE, pos); pos++
  buffer.writeUInt16LE(buffer.length - (1 + 2), pos); pos += 2
  buffer.writeUInt8(0x01, pos); pos++ #Database
  buffer.writeUInt8(oldDb.length, pos); pos++
  buffer.write(oldDb, pos, 'ucs-2'); pos += (oldDb.length * 2)
  buffer.writeUInt8(newDb.length, pos); pos++
  buffer.write(newDb, pos, 'ucs-2'); pos += (newDb.length * 2)
  #console.log(buffer)

  buffer
