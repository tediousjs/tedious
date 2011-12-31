parser = require('../../../lib/token/colmetadata-token-parser')
dataTypeByName = require('../../../lib/token/data-type').typeByName
ReadableTrackingBuffer = require('../../../lib/tracking-buffer/tracking-buffer').ReadableTrackingBuffer
WritableTrackingBuffer = require('../../../lib/tracking-buffer/tracking-buffer').WritableTrackingBuffer

module.exports.int = (test) ->
  numberOfColumns = 1
  userType = 2
  flags = 3
  columnName = 'name'

  buffer = new WritableTrackingBuffer(50, 'ucs2')

  buffer.writeUInt16LE(numberOfColumns)
  buffer.writeUInt32LE(userType)
  buffer.writeUInt16LE(flags)
  buffer.writeUInt8(dataTypeByName.Int.id)
  buffer.writeBVarchar(columnName)
  #console.log(buffer.data)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'))
  #console.log(token)

  test.ok(!token.error)
  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].userType, 2)
  test.strictEqual(token.columns[0].flags, 3)
  test.strictEqual(token.columns[0].type.name, 'Int')
  test.strictEqual(token.columns[0].colName, 'name')

  test.done()

module.exports.varchar = (test) ->
  numberOfColumns = 1
  userType = 2
  flags = 3
  length = 3
  collation = new Buffer([1,2,3,4,5])
  columnName = 'name'

  buffer = new WritableTrackingBuffer(50, 'ucs2')

  buffer.writeUInt16LE(numberOfColumns)
  buffer.writeUInt32LE(userType)
  buffer.writeUInt16LE(flags)
  buffer.writeUInt8(dataTypeByName.VarChar.id)
  buffer.writeUInt16LE(length)
  buffer.writeBuffer(collation)
  buffer.writeBVarchar(columnName)
  #console.log(buffer)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'))
  #console.log(token)

  test.ok(!token.error)
  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].userType, 2)
  test.strictEqual(token.columns[0].flags, 3)
  test.strictEqual(token.columns[0].type.name, 'VarChar')
  test.ok(token.columns[0].collation.equals(collation))
  test.strictEqual(token.columns[0].colName, 'name')
  test.strictEqual(token.columns[0].dataLength, length)

  test.done()
