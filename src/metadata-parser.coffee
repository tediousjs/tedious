codepageByLcid = require('./collation').codepageByLcid

TYPE = require('./data-type').TYPE
sprintf = require('sprintf').sprintf

module.exports = (parser, options) ->
  if options.tdsVersion < "7_2"
    userType = yield parser.readUInt16LE()
  else
    userType = yield parser.readUInt32LE()

  flags = yield parser.readUInt16LE()
  typeNumber = yield parser.readUInt8()
  type = TYPE[typeNumber]

  if !type
    throw new Error(sprintf('Unrecognised data type 0x%02X', typeNumber))

  if (type.id & 0x30) == 0x20
    # xx10xxxx - s2.2.4.2.1.3
    # Variable length
    switch type.dataLengthLength
      when 0
        dataLength = undefined
      when 1
        dataLength = yield parser.readUInt8()
      when 2
        dataLength = yield parser.readUInt16LE()
      when 4
        dataLength = yield parser.readUInt32LE()
      else
        throw new Error("Unsupported dataLengthLength #{type.dataLengthLength} for data type #{type.name}")
  else
    dataLength = undefined

  if type.hasPrecision
    precision = yield parser.readUInt8()
  else
    precision = undefined

  if type.hasScale
    scale = yield parser.readUInt8()

    if type.dataLengthFromScale
      dataLength = type.dataLengthFromScale scale
  else
    scale = undefined

  if type.hasCollation
    # s2.2.5.1.2
    collationData = yield parser.readBuffer(5)
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
    # s2.2.5.5.3
    schemaPresent = yield parser.readUInt8()

    if schemaPresent == 0x01
      schema =
        dbname: yield from parser.readBVarChar()
        owningSchema: yield from parser.readBVarChar()
        xmlSchemaCollection: yield from parser.readUsVarChar()

  udtInfo = undefined
  if type.hasUDTInfo
    # s2.2.5.5.2
    udtInfo =
      maxByteSize: yield parser.readUInt16LE()
      dbname: yield from parser.readBVarChar()
      owningSchema: yield from parser.readBVarChar()
      typeName: yield from parser.readBVarChar()
      assemblyName: yield from parser.readUsVarChar()

  metadata =
    userType: userType
    flags: flags
    type: type
    collation: collation
    precision: precision
    scale: scale
    dataLength: dataLength
    schema: schema
    udtInfo: udtInfo
