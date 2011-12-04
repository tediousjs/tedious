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

  buffer = new WritableBuffer(0)

  buffer.writeUInt8(TYPE.ROW)
  buffer.writeUInt8(0)
  buffer = buffer.data
  #console.log(buffer)

  token = parser(buffer, 1, colMetaData)
  #console.log(token)

  test.strictEqual(token.length, buffer.length - 1)
  test.strictEqual(token.columns.length, 1)
  test.ok(!token.columns[0].value)
  test.ok(token.columns[0].isNull)

  test.done()

module.exports.datetime = (test) ->
  colMetaData = [type: dataTypeByName.DateTime]

  days = 2                                        # 3rd January 1900
  threeHundredthsOfSecond = 45 * 300              # 45 seconds

  buffer = new WritableBuffer(0)

  buffer.writeUInt8(TYPE.ROW)
  buffer.writeInt32LE(days)
  buffer.writeUInt32LE(threeHundredthsOfSecond)
  buffer = buffer.data
  #console.log(buffer)

  token = parser(buffer, 1, colMetaData)
  #console.log(token)

  test.strictEqual(token.length, buffer.length - 1)
  test.strictEqual(token.columns.length, 1)
  test.ok(!token.columns[0].isNull)
  test.strictEqual(token.columns[0].value.getTime(), new Date('January 3, 1900 00:00:45').getTime())

  test.done()

module.exports.datetimeN = (test) ->
  colMetaData = [type: dataTypeByName.DateTimeN]

  buffer = new WritableBuffer(0)

  buffer.writeUInt8(TYPE.ROW)
  buffer.writeUInt8(0)
  buffer = buffer.data
  #console.log(buffer)

  token = parser(buffer, 1, colMetaData)
  #console.log(token)

  test.strictEqual(token.length, buffer.length - 1)
  test.strictEqual(token.columns.length, 1)
  test.ok(!token.columns[0].value)
  test.ok(token.columns[0].isNull)

  test.done()
