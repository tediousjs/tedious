# s2.2.7.17

TYPE = require('./data-type').TYPE

parser = (buffer, position, columnsMetaData) ->
  startPosition = position

  columns = for columnMetaData in columnsMetaData
    type = columnMetaData.type
    switch type.name
      when 'Int'
        value = buffer.readUInt32LE(position)
        position += type.dataLength
      when 'VarChar'
        dataLength = buffer.readUInt16LE(position)
        position += 2
        value = buffer.toString('ascii', position, position + dataLength)
        position += dataLength
      when 'NVarChar'
        dataLength = buffer.readUInt16LE(position)
        position += 2
        value = buffer.toString('ucs-2', position, position + (dataLength))
        position += dataLength
      else
        error = "Unrecognised column type #{type.name}"
        break

    column =
      value: value
      metadata: columnMetaData

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
