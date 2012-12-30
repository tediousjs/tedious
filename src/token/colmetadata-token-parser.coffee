# s2.2.7.4

metadataParse = require('../metadata-parser')

DIGITS_REGEX = /^\d+$/

parser = (buffer, colMetadata, tdsVersion) ->
  columnCount = buffer.readUInt16LE()

  columns = []
  for c in [1..columnCount]
    metadata = metadataParse(buffer, tdsVersion)

    if metadata.type.hasTableName
      numberOfTableNameParts = buffer.readUInt8()
      tableName = for part in [1..numberOfTableNameParts]
        buffer.readUsVarchar('ucs2')
    else
      tableName = undefined

    colName = buffer.readBVarchar()

    column =
      userType: metadata.userType
      flags: metadata.flags
      type: metadata.type
      colName: colName
      collation: metadata.collation
      precision: metadata.precision
      scale: metadata.scale
      dataLength: metadata.dataLength
      tableName: tableName

    columns.push(column)

    if !(DIGITS_REGEX.test(column.colName))
      columns[column.colName] = column

  # Return token
  name: 'COLMETADATA'
  event: 'columnMetadata'
  columns: columns

module.exports = parser
