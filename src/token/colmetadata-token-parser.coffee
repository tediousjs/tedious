# s2.2.7.4

metadataParse = require('../metadata-parser')

parser = (buffer, colMetadata, options) ->
  columnCount = buffer.readUInt16LE()

  columns = []
  for c in [1..columnCount]
    metadata = metadataParse(buffer, options)

    if metadata.type.hasTableName
      if options.tdsVersion >= '7_2'
        numberOfTableNameParts = buffer.readUInt8()
        tableName = for part in [1..numberOfTableNameParts]
          buffer.readUsVarchar('ucs2')
      else
        tableName = buffer.readUsVarchar('ucs2')
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
      udtInfo: metadata.udtInfo
      dataLength: metadata.dataLength
      tableName: tableName

    columns.push(column)

  # Return token
  name: 'COLMETADATA'
  event: 'columnMetadata'
  columns: columns

module.exports = parser
