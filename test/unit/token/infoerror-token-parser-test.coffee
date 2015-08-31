Parser = require('../../../src/token/stream-parser')
WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer

module.exports.info = (test) ->
  number = 3
  state = 4
  class_ = 5
  message = 'message'
  serverName = 'server'
  procName = 'proc'
  lineNumber = 6

  buffer = new WritableTrackingBuffer(50, 'ucs2')

  buffer.writeUInt8(0xAB)
  buffer.writeUInt16LE(0)         # Length written later
  buffer.writeUInt32LE(number)
  buffer.writeUInt8(state)
  buffer.writeUInt8(class_)
  buffer.writeUsVarchar(message)
  buffer.writeBVarchar(serverName)
  buffer.writeBVarchar(procName)
  buffer.writeUInt32LE(lineNumber)

  data = buffer.data
  data.writeUInt16LE(data.length - 3, 1)

  parser = new Parser({ token: -> }, {}, { tdsVersion: '7_2' })
  parser.write(data)
  token = parser.read()

  test.strictEqual(token.number, number)
  test.strictEqual(token.state, state)
  test.strictEqual(token.class, class_)
  test.strictEqual(token.message, message)
  test.strictEqual(token.serverName, serverName)
  test.strictEqual(token.procName, procName)
  test.strictEqual(token.lineNumber, lineNumber)

  test.done()
