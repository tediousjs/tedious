codepageByLcid = require('./collation').codepageByLcid

TYPE = require('./data-type').TYPE
sprintf = require('sprintf').sprintf

parse = (buffer, tdsVersion) ->
  if tdsVersion < "7_2"
    userType = buffer.readUInt16LE()
  else
    userType = buffer.readUInt32LE()
  flags = buffer.readUInt16LE()
  typeNumber = buffer.readUInt8()
  type = TYPE[typeNumber]

  if !type
    throw new Error(sprintf('Unrecognised data type 0x%02X at offset 0x%04X', typeNumber, (buffer.position - 1)))

  #console.log(type)

  if (type.id & 0x30) == 0x20
    # xx10xxxx - s2.2.4.2.1.3
    # Variable length
    switch type.dataLengthLength
      when 1
        dataLength = buffer.readUInt8()
      when 2
        dataLength = buffer.readUInt16LE()
      when 4
        dataLength = buffer.readUInt32LE()
      else
        throw new Error("Unsupported dataLengthLength #{type.dataLengthLength} for data type #{type.name}")
  else
    dataLength = undefined

  if type.hasPrecision
    precision = buffer.readUInt8()
  else
    precision = undefined

  if type.hasScale
    scale = buffer.readUInt8()
  else
    scale = undefined

  if type.hasCollation
    # s2.2.5.1.2
    collationData = buffer.readBuffer(5)
    collation = {}

    collation.lcid = (collationData[2] & 0x0F) << 16
    collation.lcid |= collationData[1] << 8
    collation.lcid |= collationData[0]

    collation.codepage = codepageByLcid[collation.lcid]

    # This may not be extracting the correct nibbles in the correct order.
    collation.flags = collationData[3] >> 4
    collation.flags |= collationData[2] & 0xF0

    # This may not be extracting the correct nibble.
    collation.version = collationData[3] & 0x0F

    collation.sortId = collationData[4]
  else
    collation = undefined

  schema = undefined
  if type.hasSchemaPresent
    schemaPresent = buffer.readUInt8()

    if schemaPresent == 0x01
      schema =
        dbname: buffer.readBVarchar()
        owningSchema: buffer.readBVarchar()
        xmlSchemaCollection: buffer.readUsVarchar()

  metadata =
    userType: userType
    flags: flags
    type: type
    collation: collation
    precision: precision
    scale: scale
    dataLength: dataLength
    schema: schema

module.exports = parse
