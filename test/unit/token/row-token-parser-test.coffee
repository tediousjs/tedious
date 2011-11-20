parser = require('../../../lib/token/row-token-parser')
TYPE = require('../../../lib/token/token').TYPE
dataTypeByName = require('../../../lib/token/data-type').typeByName

module.exports.int = (test) ->
  colMetaData = [
    type:
      name: 'Int'
      dataLength: 4
  ]

  value = 3

  buffer = new Buffer(1 + 4)
  pos = 0;

  buffer.writeUInt8(TYPE.ROW, pos); pos++
  buffer.writeUInt32LE(value, pos); pos += 4
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
  colMetaData = [
    type:
      name: 'VarChar'
      dataLengthLength: 2
  ]

  value = 'abc'

  buffer = new Buffer(1 + 2 + 3)
  pos = 0;

  buffer.writeUInt8(TYPE.ROW, pos); pos++
  buffer.writeUInt16LE(value.length, pos); pos += colMetaData[0].type.dataLengthLength
  buffer.write(value, pos, 'ascii'); pos += value.length
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
  colMetaData = [
    type:
      name: 'NVarChar'
      dataLengthLength: 2
  ]

  value = 'abc'

  buffer = new Buffer(1 + 2 + 6)
  pos = 0;

  buffer.writeUInt8(TYPE.ROW, pos); pos++
  buffer.writeUInt16LE(value.length * 2, pos); pos += colMetaData[0].type.dataLengthLength
  buffer.write(value, pos, 'ucs-2'); pos += (value.length * 2)
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
  colMetaData = [
    type:
      name: 'IntN'
      dataLengthLength: 1
  ]

  value = 0

  buffer = new Buffer(1 + 1)
  pos = 0;

  buffer.writeUInt8(TYPE.ROW, pos); pos++
  buffer.writeUInt8(value, pos); pos++
  #console.log(buffer)

  token = parser(buffer, 1, colMetaData)
  #console.log(token)

  test.strictEqual(token.length, buffer.length - 1)
  test.strictEqual(token.columns.length, 1)
  test.ok(!token.columns[0].value)
  test.ok(token.columns[0].isNull)

  test.done()
