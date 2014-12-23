# s2.2.7.4

metadataParse = require('../metadata-parser')

module.exports = (parser, colMetadata, options) ->
  columnCount = yield parser.readUInt16LE()

  columns = []
  for c in [0...columnCount]
    metadata = yield from metadataParse(parser, options)

    if metadata.type.hasTableName
      if options.tdsVersion >= '7_2'
        numberOfTableNameParts = yield parser.readUInt8()
        tableName = for part in [1..numberOfTableNameParts]
          yield from parser.readUsVarChar()
      else
        tableName = yield from parser.readUsVarChar()
    else
      tableName = undefined

    colName = yield from parser.readBVarChar()

    if options.columnNameReplacer
      colName = options.columnNameReplacer(colName, c, metadata)
    else if options.camelCaseColumns
      colName = colName.replace /^[A-Z]/, (s) -> s.toLowerCase()

    columns.push
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

  # Return token
  name: 'COLMETADATA'
  event: 'columnMetadata'
  columns: columns
