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
  17:
    name: 'TXN_ENDED'

module.exports = (buffer, position) ->
  if buffer.length - position < 3
    # Not long enough to contain length and type bytes.
    return false

  length = buffer.readUInt16LE(position)
  position += 2
  if (buffer.length - position < length)
    # Not long enough for the extracted length
    return false

  typeNumber = buffer.readUInt8(position)
  position++
  type = types[typeNumber]

  if type
    switch type.name
      when 'DATABASE', 'LANGUAGE', 'CHARSET', 'PACKET_SIZE'
        valueLength = buffer.readUInt8(position) * 2
        position++
        newValue = buffer.toString('ucs-2', position, position + valueLength)
        position += valueLength

        valueLength = buffer.readUInt8(position) * 2
        position++
        oldValue = buffer.toString('ucs-2', position, position + valueLength)
        position += valueLength
      when 'SQL_COLLATION'
        valueLength = buffer.readUInt8(position)
        position++
        newValue = buffer.slice(position, position + valueLength)
        position += valueLength

        valueLength = buffer.readUInt8(position)
        position++
        oldValue = buffer.slice(position, position + valueLength)
        position += valueLength
      else
        error = "Unsupported ENVCHANGE type #{typeNumber} #{type.name} at offset #{position}"

    if type.name == 'PACKET_SIZE'
      newValue = parseInt(newValue)
      oldValue = parseInt(oldValue)
  else
    error = "Unsupported ENVCHANGE type #{typeNumber}"

  if error
    token =
      name: 'ENVCHANGE'
      error: error
  else
    token =
      name: 'ENVCHANGE'
      length: length + 2
      type: type.name
      event: type.event
      oldValue: oldValue
      newValue: newValue
