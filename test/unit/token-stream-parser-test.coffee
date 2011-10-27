Parser = require('../../lib/token-stream-parser').Parser
TYPE = require('../../lib/token').TYPE

module.exports.nop = (test) ->
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
  console.log(buffer)

  parser = new Parser()
  parser.addBuffer(buffer)

  test.done()
