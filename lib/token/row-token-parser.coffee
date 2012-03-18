# s2.2.7.17

valueParse = require('../value-parser')
sprintf = require('sprintf').sprintf

parser = (buffer, columnsMetaData) ->
  columns = []
  for columnMetaData in columnsMetaData
    #console.log sprintf('Token @ 0x%02X', buffer.position)

    value = valueParse(buffer, columnMetaData)

    column =
      value: value
      metadata: columnMetaData

    columns.push(column)
    columns[columnMetaData.colName] = column

  # Return token
  name: 'ROW'
  event: 'row'
  columns: columns

module.exports = parser
