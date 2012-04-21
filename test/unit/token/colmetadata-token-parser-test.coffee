parser = require('../../../src/token/colmetadata-token-parser')
dataTypeByName = require('../../../src/data-type').typeByName
ReadableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').ReadableTrackingBuffer
WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer

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
  test.strictEqual(token.columns.name.colName, 'name')

  test.done()

module.exports.varchar = (test) ->
  numberOfColumns = 1
  userType = 2
  flags = 3
  length = 3
  collation = new Buffer([0x09, 0x04, 0x50, 0x78, 0x9a])
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
  test.strictEqual(token.columns[0].collation.lcid, 0x0409)
  test.strictEqual(token.columns[0].collation.codepage, 'WINDOWS-1252')
  test.strictEqual(token.columns[0].collation.flags, 0x57)
  test.strictEqual(token.columns[0].collation.version, 0x8)
  test.strictEqual(token.columns[0].collation.sortId, 0x9a)
  test.strictEqual(token.columns[0].colName, 'name')
  test.strictEqual(token.columns.name.colName, 'name')
  test.strictEqual(token.columns[0].dataLength, length)

  test.done()
