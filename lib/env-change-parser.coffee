
types =
  1: 'DATABASE',
  2: 'LANGUAGE',
  3: 'CHARSET',
  4: 'PACKET_SIZE',
  7: 'SQL_COLLATION',
  8: 'BEGIN_TXN',
  9: 'COMMIT_TXN',
  10: 'ROLLBACK_TXN',
  17: 'TXN_ENDED'

module.exports = (buffer, position) ->
  if buffer.length - position < 3
    # Not long enough to contain length and type bytes.
    return false

  length = buffer.readUInt16LE(position)
  position += 2
  if (buffer.length - position < length)
    # Not long enough for the extracted length
    return false

  type = buffer.readUInt8(position)
  position++
  typeString = types[type]

  switch typeString
    when 'DATABASE', 'LANGUAGE', 'CHARSET', 'PACKET_SIZE'
      valueLength = buffer.readUInt8(position) * 2
      position++
      newValue = buffer.toString('ucs-2', position, position + valueLength)
      position += valueLength

      valueLength = buffer.readUInt8(position) * 2
      position++
      oldValue = buffer.toString('ucs-2', position, position + valueLength)
      position += valueLength
    else
      error = "Unsupported ENVCHANGE type #{type}"

  if typeString == 'PACKET_SIZE'
    newValue = parseInt(newValue)
    oldValue = parseInt(oldValue)

  if error
    token =
      error: error
  else
    token =
      length: length + 2,
      type: typeString,
      oldValue: oldValue,
      newValue: newValue
