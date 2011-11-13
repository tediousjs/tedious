parser = require('../../../lib/token/colmetadata-token-parser')
TYPE = require('../../../lib/token/token').TYPE
dataTypeByName = require('../../../lib/token/data-type').typeByName

module.exports.int = (test) ->
  numberOfColumns = 1
  userType = 2
  flags = 3
  columnName = 'name'

  buffer = new Buffer(1 + 2 + (4 + 2 + 1 + 1 + (columnName.length * 2)))
  pos = 0;

  buffer.writeUInt8(TYPE.COLMETADATA, pos); pos++
  buffer.writeUInt16LE(numberOfColumns, pos); pos += 2
  buffer.writeUInt32LE(userType, pos); pos += 4
  buffer.writeUInt16LE(flags, pos); pos += 2
  buffer.writeUInt8(dataTypeByName.Int.id, pos); pos++
  buffer.writeUInt8(columnName.length, pos); pos++
  buffer.write(columnName, pos, 'ucs-2'); pos += (columnName.length * 2)
  #console.log(buffer)

  token = parser(buffer, 1)
  #console.log(token)

  test.strictEqual(token.length, buffer.length - 1)
  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].userType, 2)
  test.strictEqual(token.columns[0].flags, 3)
  test.strictEqual(token.columns[0].type.name, 'Int')
  test.strictEqual(token.columns[0].colName, 'name')
  test.strictEqual(token.columns[0].dataLength, 4)

  test.done()

module.exports.varchar = (test) ->
  numberOfColumns = 1
  userType = 2
  flags = 3
  length = 3
  collation = [1,2,3,4,5]
  columnName = 'name'

  buffer = new Buffer(1 + 2 + (4 + 2 + 1 + 2 + 5 + 1 + (columnName.length * 2)))
  pos = 0;

  buffer.writeUInt8(TYPE.COLMETADATA, pos); pos++
  buffer.writeUInt16LE(numberOfColumns, pos); pos += 2
  buffer.writeUInt32LE(userType, pos); pos += 4
  buffer.writeUInt16LE(flags, pos); pos += 2
  buffer.writeUInt8(dataTypeByName.VarChar.id, pos); pos++
  buffer.writeUInt16LE(length, pos); pos += 2
  for p in [0..(collation.length - 1)]
    buffer[pos + p] = collation[p]
  pos += collation.length
  buffer.writeUInt8(columnName.length, pos); pos++
  buffer.write(columnName, pos, 'ucs-2'); pos += (columnName.length * 2)
  #console.log(buffer)

  token = parser(buffer, 1)
  #console.log(token)

  test.strictEqual(token.length, buffer.length - 1)
  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].userType, 2)
  test.strictEqual(token.columns[0].flags, 3)
  test.strictEqual(token.columns[0].type.name, 'VarChar')
  test.deepEqual(token.columns[0].collation, collation)
  test.strictEqual(token.columns[0].colName, 'name')
  test.strictEqual(token.columns[0].dataLength, length)

  test.done()
