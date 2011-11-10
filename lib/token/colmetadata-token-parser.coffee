# s2.2.7.4

TYPE = require('./data-type').TYPE

parser = (buffer, position) ->
  startPosition = position

  columnCount = buffer.readUInt16LE(position)
  position += 2

  columns = for c in [1..columnCount]
    userType = buffer.readUInt32LE(position)
    position += 4

    flags = buffer.readUInt16LE(position)
    position +=2

    typeNumber = buffer.readUInt8(position)
    type = TYPE[typeNumber]
    position++
    
    if !type
      error = "Unrecognised data type #{typeNumber}"
      break

    console.log(type)

    if type.fixedLength
      dataLength = type.dataLength
    else if type.variableLength
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
      collation = Array.prototype.slice.call(buffer, position, position + 5)
      position += 5

    colNameLength = buffer.readUInt8(position) * 2
    position++
    colName = buffer.toString('ucs-2', position, position + colNameLength)
    position += colNameLength

    column =
      userType: userType
      flags: flags
      type: type
      colName: colName
      collation: collation
      dataLength: dataLength

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
