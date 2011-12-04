parser = require('../../../lib/token/row-token-parser')
TYPE = require('../../../lib/token/token').TYPE
dataTypeByName = require('../../../lib/token/data-type').typeByName
WritableBuffer = require('../../../lib/tracking-buffer/tracking-buffer').WritableTrackingBuffer

module.exports.int = (test) ->
  colMetaData = [type: dataTypeByName.Int]

  value = 3

  buffer = new WritableBuffer(0)
  buffer.writeUInt8(TYPE.ROW)
  buffer.writeUInt32LE(value)
  buffer = buffer.data
  #console.log(buffer)

  token = parser(buffer, 1, colMetaData)
  #console.log(token)

  test.strictEqual(token.length, buffer.length - 1)
  test.strictEqual(token.columns.length, 1)
  test.ok(!token.columns[0].isNull)
  test.strictEqual(token.columns[0].value, value)
  test.strictEqual(token.columns[0].metadata, colMetaData[0])

  test.done()

module.exports.varChar = (test) ->
  colMetaData = [type: dataTypeByName.VarChar]

  value = 'abc'

  buffer = new WritableBuffer(0, 'ascii')
  buffer.writeUInt8(TYPE.ROW)
  buffer.writeUInt16LE(value.length)
  buffer.writeString(value)
  buffer = buffer.data
  #console.log(buffer)

  token = parser(buffer, 1, colMetaData)
  #console.log(token)

  test.strictEqual(token.length, buffer.length - 1)
  test.strictEqual(token.columns.length, 1)
  test.ok(!token.columns[0].isNull)
  test.strictEqual(token.columns[0].value, value)
  test.strictEqual(token.columns[0].metadata, colMetaData[0])

  test.done()

module.exports.nVarChar = (test) ->
  colMetaData = [type: dataTypeByName.NVarChar]

  value = 'abc'

  buffer = new WritableBuffer(0, 'ucs2')
  buffer.writeUInt8(TYPE.ROW)
  buffer.writeUInt16LE(value.length * 2)
  buffer.writeString(value)
  buffer = buffer.data
  #console.log(buffer)

  token = parser(buffer, 1, colMetaData)
  #console.log(token)

  test.strictEqual(token.length, buffer.length - 1)
  test.strictEqual(token.columns.length, 1)
  test.ok(!token.columns[0].isNull)
  test.strictEqual(token.columns[0].value, value)
  test.strictEqual(token.columns[0].metadata, colMetaData[0])

  test.done()

module.exports.intN = (test) ->
  colMetaData = [type: dataTypeByName.IntN]

  value = 0

  buffer = new WritableBuffer(0)

  buffer.writeUInt8(TYPE.ROW)
  buffer.writeUInt8(value)
  buffer = buffer.data
  #console.log(buffer)

  token = parser(buffer, 1, colMetaData)
  #console.log(token)

  test.strictEqual(token.length, buffer.length - 1)
  test.strictEqual(token.columns.length, 1)
  test.ok(!token.columns[0].value)
  test.ok(token.columns[0].isNull)

  test.done()
