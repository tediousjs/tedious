# s2.2.7.13 (introduced in TDS 7.3.B)

valueParse = require('../value-parser')
sprintf = require('sprintf').sprintf

DIGITS_REGEX = /^\d+$/

parser = (buffer, columnsMetaData, options) ->
  length = Math.ceil columnsMetaData.length / 8
  bytes = buffer.readBuffer length
  bitmap = []

  for byte in bytes
    for i in [0..7]
      bitmap.push if byte & (1 << i) then true else false

  columns = []
  for columnMetaData, index in columnsMetaData
    #console.log sprintf('Token @ 0x%02X', buffer.position)

    if bitmap[index]
      value = null
    else
      value = valueParse(buffer, columnMetaData, options)

    column =
      value: value
      metadata: columnMetaData

    columns.push(column)

    if !(DIGITS_REGEX.test(columnMetaData.colName))
      saveColumn(columnMetaData.colName, columns, column)

  # Return token
  name: 'NBCROW'
  event: 'row'
  columns: columns

saveColumn = (columnName, columns, value) ->
  entry = columns[columnName]
  if !entry
    columns[columnName] = value;
  else if Array.isArray(entry)
    entry.push(value)
  else
    columns[columnName] = [entry, value]

module.exports = parser
