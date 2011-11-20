# s2.2.7.17

TYPE = require('./data-type').TYPE
sprintf = require('sprintf').sprintf

NULL = (1 << 16) - 1

parser = (buffer, position, columnsMetaData) ->
  startPosition = position

  columns = []
  for columnMetaData in columnsMetaData
    isNull = false
    type = columnMetaData.type
    switch type.name
      when 'Int'
        if buffer.length - position < type.dataLength
          return false
        value = buffer.readUInt32LE(position)
        position += type.dataLength
      when 'VarChar', 'Char'
        if buffer.length - position < 2
          return false
        dataLength = buffer.readUInt16LE(position)
        position += 2

        if dataLength == NULL
          value = undefined
          isNull = true
        else
          if buffer.length - position < dataLength
            return false
          value = buffer.toString('ascii', position, position + dataLength)
          position += dataLength
      when 'NVarChar'
        if buffer.length - position < 2
          return false
        dataLength = buffer.readUInt16LE(position)
        position += 2

        if dataLength == NULL
          value = undefined
          isNull = true
        else
          if buffer.length - position < dataLength
            return false
          value = buffer.toString('ucs-2', position, position + (dataLength))
          position += dataLength
      else
        error = "Unrecognised column type #{type.name}"
        break
      
    columns.push(
      value: value
      metadata: columnMetaData
    )

  columns.byName = ->
    byName = {}

    for column in columns
      byName[column.metadata.colName] = column

    byName

  if error
    token =
      name: 'ROW'
      error: error
  else
    token =
      name: 'ROW'
      length: position - startPosition
      event: 'row'
      columns: columns

module.exports = parser
