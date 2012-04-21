parser = require('../../../src/token/done-token-parser').doneParser
ReadableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').ReadableTrackingBuffer
WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer

parse = (status, curCmd, doneRowCount) ->
  doneRowCountLow = doneRowCount % 0x100000000
  doneRowCountHi = ~~(doneRowCount / 0x100000000)

  buffer = new WritableTrackingBuffer(50, 'ucs2')

  buffer.writeUInt16LE(status)
  buffer.writeUInt16LE(curCmd)
  buffer.writeUInt32LE(doneRowCountLow)
  buffer.writeUInt32LE(doneRowCountHi)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'))
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
