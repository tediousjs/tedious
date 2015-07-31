# s2.2.7.17

valueParse = require('../value-parser')
sprintf = require('sprintf').sprintf

module.exports = (parser, columnsMetaData, options) ->
  columns = if options.useColumnNames then {} else []
  for columnMetaData in columnsMetaData
    #console.log sprintf('Token @ 0x%02X', buffer.position)

    value = yield from valueParse(parser, columnMetaData, options)

    column =
      value: value
      metadata: columnMetaData

    if options.useColumnNames
      unless columns[columnMetaData.colName]?
        columns[columnMetaData.colName] = column
    else
      columns.push(column)

  # Return token
  name: 'ROW'
  event: 'row'
  columns: columns
