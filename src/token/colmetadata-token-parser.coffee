# s2.2.7.4

metadataParse = require('../metadata-parser')

parser = (buffer, callback) ->
  token =
    name: 'COLMETADATA'
    event: 'columnMetadata'
    columns: []

  columnCount = undefined
  c = 0

  readTableName = (callback) ->
    buffer.readUInt8((numberOfTableNameParts) ->
      requestValues = {}
      for partNumber in [1..numberOfTableNameParts]
        requestValues["part#{partNumber}"] = [buffer.readUsVarchar, ['ucs2']]
      buffer.readMultiple(requestValues, (partValues) ->
        tableName = for partNumber in [1..numberOfTableNameParts]
          partValues["part#{partNumber}"]

        callback(tableName)
      )
    )

  readColumn = ->
    if c == columnCount
      callback(token)
    else
      metadataParse(buffer, (metadata) ->
        readColumnName = ->
          buffer.readBVarchar('ucs2', (columnName) ->
            column.colName = columnName
            token.columns.push(column)
            token.columns[column.colName] = column

            c++
            readColumn()
          )

        column =
          userType: metadata.userType
          flags: metadata.flags
          type: metadata.type
          collation: metadata.collation
          precision: metadata.precision
          scale: metadata.scale
          dataLength: metadata.dataLength

        if metadata.type.hasTableName
          readTableName((tableName) ->
            column.tableName = tableName
            readColumnName()
          )
        else
          readColumnName()
      )


  buffer.readUInt16LE((value) ->
    columnCount = value
    readColumn()
  )

module.exports = parser
