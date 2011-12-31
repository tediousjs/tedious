# s2.2.7.4

TYPE = require('./data-type').TYPE
sprintf = require('sprintf').sprintf

parser = (buffer) ->
  columnCount = buffer.readUInt16LE()

  columns = []
  for c in [1..columnCount]
    userType = buffer.readUInt32LE()
    flags = buffer.readUInt16LE()
    typeNumber = buffer.readUInt8()
    type = TYPE[typeNumber]

    if !type
      error = sprintf('Unrecognised data type 0x%02X at offset 0x%04X', typeNumber, (buffer.position - 1))
      break

    #console.log(type)

    if type.fixedLength
      dataLength = type.dataLength
    else if type.variableLength
      switch type.dataLengthLength
        when 1
          dataLength = buffer.readUInt8()
        when 2
          dataLength = buffer.readUInt16LE()
        when 4
          dataLength = buffer.readUInt32LE()
        else
          error = "Unrecognised dataLengthLength for type #{type}"
          break

    if type.hasPrecision
      precision = buffer.readUInt8()
    else
      precision = undefined

    if type.hasScale
      scale = buffer.readUInt8()
    else
      scale = undefined

    if type.hasCollation
      collation = buffer.readBuffer(5)
    else
      collation = undefined

    colName = buffer.readBVarchar()

    columns.push(
      userType: userType
      flags: flags
      type: type
      colName: colName
      collation: collation
      precision: precision
      scale: scale
      dataLength: dataLength
    )

  if error
    token =
      name: 'COLMETADATA'
      error: error
  else
    token =
      name: 'COLMETADATA'
      event: 'columnMetadata'
      columns: columns

module.exports = parser
