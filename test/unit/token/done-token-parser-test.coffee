parser = require('../../../lib/token/done-token-parser')
TYPE = require('../../../lib/token/token').TYPE

parse = (status, curCmd, doneRowCount) ->
  doneRowCountLow = doneRowCount % 0x100000000
  doneRowCountHi = ~~(doneRowCount / 0x100000000)

  buffer = new Buffer(1 + 2 + 2 + 8)
  pos = 0;

  buffer.writeUInt8(TYPE.DONE, pos); pos++
  buffer.writeUInt16LE(status, pos); pos += 2
  buffer.writeUInt16LE(curCmd, pos); pos += 2
  buffer.writeUInt32LE(doneRowCountLow, pos); pos += 4
  buffer.writeUInt32LE(doneRowCountHi, pos); pos += 4
  #console.log(buffer)

  token = parser(buffer, 1)
  #console.log(token)
  
  token

module.exports.done = (test) ->
  status = 0x0000
  curCmd = 1
  doneRowCount = 2

  token = parse(status, curCmd, doneRowCount)

  test.ok(!token.more)
  test.strictEqual(token.curCmd, curCmd)
  test.ok(!token.rowCount)

  test.done()

module.exports.more = (test) ->
  status = 0x0001
  curCmd = 1
  doneRowCount = 2

  token = parse(status, curCmd, doneRowCount)

  test.ok(token.more)
  test.strictEqual(token.curCmd, curCmd)
  test.ok(!token.rowCount)

  test.done()

module.exports.doneRowCount = (test) ->
  status = 0x0010
  curCmd = 1
  doneRowCount = 0x1200000034

  token = parse(status, curCmd, doneRowCount)

  test.ok(!token.more)
  test.strictEqual(token.curCmd, 1)
  test.strictEqual(token.rowCount, doneRowCount)

  test.done()
