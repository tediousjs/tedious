# s2.2.7.17

valueParse = require('./value-parser')
sprintf = require('sprintf').sprintf

parser = ->
  columns = if @options.useColumnNames then {} else []

  for columnMetaData in @colMetadata
    do (columnMetaData) =>
      #console.log sprintf('Token @ 0x%02X', buffer.position)

      valueParse.call(@, columnMetaData)
      @tap ->
        column =
          value: @vars.value
          metadata: columnMetaData
        
        if @options.useColumnNames
          unless columns[columnMetaData.colName]?
            columns[columnMetaData.colName] = column
        else
          columns.push(column)

  @tap ->

    @push
      # Return token
      name: 'ROW'
      event: 'row'
      columns: columns

module.exports = parser
