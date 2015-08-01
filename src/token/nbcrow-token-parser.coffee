# s2.2.7.13 (introduced in TDS 7.3.B)

valueParse = require('../value-parser')
sprintf = require('sprintf').sprintf

module.exports = (parser, columnsMetaData, options) ->
  length = Math.ceil columnsMetaData.length / 8
  bytes = yield parser.readBuffer(length)
  bitmap = []

  for byte in bytes
    for i in [0..7]
      bitmap.push if byte & (1 << i) then true else false

  columns = if options.useColumnNames then {} else []
  for columnMetaData, index in columnsMetaData
    #console.log sprintf('Token @ 0x%02X', buffer.position)

    if bitmap[index]
      value = null
    else
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
  name: 'NBCROW'
  event: 'row'
  columns: columns
