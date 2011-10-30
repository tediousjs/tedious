infoParser = require('../../lib/infoerror-token-parser').infoParser
TYPE = require('../../lib/token').TYPE

module.exports.info = (test) ->
  number = 3
  state = 4
  class_ = 5
  message = 'message'
  serverName = 'server'
  procName = 'proc'
  lineNumber = 6

  buffer = new Buffer(1 + 2 + 4 + 1 + 1 + 2 +
    (message.length * 2) + 1 + (serverName.length * 2) + 1 + (procName.length * 2) + 4)
  pos = 0;

  buffer.writeUInt8(TYPE.INFO, pos); pos++
  buffer.writeUInt16LE(buffer.length - (1 + 2), pos); pos += 2
  buffer.writeUInt32LE(number, pos); pos += 4
  buffer.writeUInt8(state, pos); pos++
  buffer.writeUInt8(class_, pos); pos++

  buffer.writeUInt16LE(message.length, pos); pos += 2
  buffer.write(message, pos, 'ucs-2'); pos += (message.length * 2)

  buffer.writeUInt8(serverName.length, pos); pos++
  buffer.write(serverName, pos, 'ucs-2'); pos += (serverName.length * 2)

  buffer.writeUInt8(procName.length, pos); pos++
  buffer.write(procName, pos, 'ucs-2'); pos += (procName.length * 2)

  buffer.writeUInt32LE(lineNumber, pos); pos += 4
  #console.log(buffer)

  token = infoParser(buffer, 1)
  #console.log(token)

  test.strictEqual(token.length, buffer.length - 1)
  test.strictEqual(token.number, number)
  test.strictEqual(token.state, state)
  test.strictEqual(token.class, class_)
  test.strictEqual(token.message, message)
  test.strictEqual(token.serverName, serverName)
  test.strictEqual(token.procName, procName)
  test.strictEqual(token.lineNumber, lineNumber)

  test.done()
