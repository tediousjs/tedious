# s2.2.7.8

EventEmitter = require('events').EventEmitter

types =
  1:
    name: 'DATABASE'
    event: 'databaseChange'
  2:
    name: 'LANGUAGE',
    event: 'languageChange'
  3:
    name: 'CHARSET'
    event: 'charsetChange'
  4:
    name: 'PACKET_SIZE'
    event: 'packetSizeChange'
  7:
    name: 'SQL_COLLATION'
    event: 'sqlCollationChange'
  8:
    name: 'BEGIN_TXN'
  9:
    name: 'COMMIT_TXN'
  10:
    name: 'ROLLBACK_TXN'
  13:
    name: 'DATABASE_MIRRORING_PARTNER'
    event: 'partnerNode'
  17:
    name: 'TXN_ENDED'

module.exports = (buffer, callback) ->
  type = undefined

  returnValues = (values) ->
    if type.name == 'PACKET_SIZE'
      newValue = parseInt(values.newValue)
      oldValue = parseInt(values.oldValue)
    else
      newValue = values.newValue
      oldValue = values.oldValue

    token =
      name: 'ENVCHANGE'
      type: type.name
      event: type.event
      oldValue: oldValue
      newValue: newValue

    callback(token)

  readValues = (typeValues) ->
      type = types[typeValues.typeNumber]

      if type
        switch type.name
          when 'DATABASE', 'LANGUAGE', 'CHARSET', 'PACKET_SIZE', 'DATABASE_MIRRORING_PARTNER'
            buffer.readMultiple(
              newValue: [buffer.readBVarchar, ['ucs2']]
              oldValue: [buffer.readBVarchar, ['ucs2']]
              , returnValues
            )
          when 'SQL_COLLATION'
            buffer.readMultiple(
              newValue: buffer.readBBuffer
              oldValue: buffer.readBBuffer
              , returnValues
            )
          else
            throw new Error("Unsupported ENVCHANGE type #{typeValues.typeNumber} #{type.name} at offset #{buffer.position - 1}")
      else
        throw new Error("Unsupported ENVCHANGE type #{typeValues.typeNumber} at offset #{buffer.position - 1}")

  buffer.readMultiple(
    length: buffer.readUInt16LE
    typeNumber: buffer.readUInt8
    , readValues)
