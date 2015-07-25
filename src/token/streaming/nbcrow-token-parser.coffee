# s2.2.7.13 (introduced in TDS 7.3.B)

valueParse = require('./value-parser')
sprintf = require('sprintf').sprintf

parser = ->
  length = Math.ceil @colMetadata.length / 8

  bitmap = []
  @buffer "bytes", length
  @tap ->
    for byte in @vars.bytes
      for i in [0..7]
        bitmap.push if byte & (1 << i) then true else false

  columns = if @options.useColumnNames then {} else []

  @tap ->
    for columnMetaData, index in @colMetadata
      do (columnMetaData) =>
        #console.log sprintf('Token @ 0x%02X', buffer.position)

        if bitmap[index]
          @tap ->
            @vars.value = null
        else
          valueParse.call(@, columnMetaData)

        @tap ->

          console.log("value", @vars.value)

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
      name: 'NBCROW'
      event: 'row'
      columns: columns

module.exports = parser
