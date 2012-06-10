async = require('async')
valueParse = require('../value-parser')
sprintf = require('sprintf').sprintf

# s2.2.7.17
parser = (buffer, columnsMetaData, callback) ->
  columns = []
  columnNumber = 0

  async.whilst(
    ->
      columnNumber < columnsMetaData.length

    , (callback) ->
      columnMetaData = columnsMetaData[columnNumber]

      valueParse(buffer, columnMetaData, (value) ->
        column =
          value: value
          metadata: columnMetaData

        columns.push(column)
        columns[columnMetaData.colName] = column

        columnNumber++
        callback()
      )

    , ->
      callback(
        name: 'ROW'
        event: 'row'
        columns: columns
      )
  )

module.exports = parser
