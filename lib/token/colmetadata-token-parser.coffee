# s2.2.7.4

TYPE = require('./data-type').TYPE
sprintf = require('sprintf').sprintf

parser = (buffer, position) ->
  startPosition = position

  if buffer.length - position < 2
    return false
  columnCount = buffer.readUInt16LE(position)
  position += 2

  columns = []
  for c in [1..columnCount]
    if buffer.length - position < 4 + 2 + 1
      return false

    userType = buffer.readUInt32LE(position)
    position += 4

    flags = buffer.readUInt16LE(position)
    position +=2

    typeNumber = buffer.readUInt8(position)
    type = TYPE[typeNumber]
    position++
    
    if !type
      error = "Unrecognised data type #{typeNumber} at offset #{position - 1}"
      error = sprintf('Unrecognised data type 0x%02X at offset 0x%04X', typeNumber, (position - 1))
      break

    #console.log(type)

    if type.fixedLength
      dataLength = type.dataLength
    else if type.variableLength
      if buffer.length - position < type.dataLengthLength
        return false

      switch type.dataLengthLength
        when 1
          dataLength = buffer.readUInt8(position)
        when 2
          dataLength = buffer.readUInt16LE(position)
        when 4
          dataLength = buffer.readUInt32LE(position)
        else
          error = "Unrecognised dataLengthLength for type #{type}"
          break
      position += type.dataLengthLength
      
    if type.hasCollation
      if buffer.length - position < 5
        return false
      collation = Array.prototype.slice.call(buffer, position, position + 5)
      position += 5

    if buffer.length - position < 1
      return false
    colNameLength = buffer.readUInt8(position) * 2
    position++

    if buffer.length - position < colNameLength
      return false
    colName = buffer.toString('ucs-2', position, position + colNameLength)
    position += colNameLength

    columns.push(
      userType: userType
      flags: flags
      type: type
      colName: colName
      collation: collation
      dataLength: dataLength
    )

  if error
    token =
      name: 'COLMETADATA'
      error: error
  else
    token =
      name: 'COLMETADATA'
      length: position - startPosition
      event: 'columnMetadata'
      columns: columns

module.exports = parser
