# s2.2.7.17

TYPE = require('./data-type').TYPE
sprintf = require('sprintf').sprintf

NULL = (1 << 16) - 1

parser = (buffer, position, columnsMetaData) ->
  startPosition = position

  columns = []
  for columnMetaData in columnsMetaData
    #console.log sprintf('Token @ 0x%02X', position)

    isNull = false
    type = columnMetaData.type
    switch type.name
      when 'TinyInt'
        if buffer.length - position < type.dataLength
          return false
        value = buffer.readUInt8(position)
        position += type.dataLength
      when 'Int'
        if buffer.length - position < type.dataLength
          return false
        value = buffer.readInt32LE(position)
        position += type.dataLength
      when 'SmallInt'
        if buffer.length - position < type.dataLength
          return false
        value = buffer.readInt16LE(position)
        position += type.dataLength
      when 'IntN'
        if buffer.length - position < 1
          return false
        dataLength = buffer.readUInt8(position)
        position++

        if buffer.length - position < dataLength
          return false

        #console.log dataLength, position
        switch dataLength
          when 0
            isNull = true
          when 1
            value = buffer.readInt8(position)
          when 2
            value = buffer.readInt16LE(position)
          when 4
            value = buffer.readInt32LE(position)

        position += dataLength
      when 'Bit'
        if buffer.length - position < type.dataLength
          return false
        value = !!buffer.readUInt8(position)
        position += type.dataLength
      when 'BitN'
        if buffer.length - position < 1
          return false
        dataLength = buffer.readUInt8(position)
        position++

        if buffer.length - position < dataLength
          return false

        #console.log dataLength, position
        switch dataLength
          when 0
            isNull = true
          when 1
            value = !!buffer.readUInt8(position)

        position += dataLength
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
        error = sprintf('Unrecognised column type %s at offset 0x%04X', type.name, (position - 1))
        break
      
    columns.push(
      value: value
      isNull: isNull,
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
