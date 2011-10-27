
types =
  1: 'DATABASE'

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
    when 'DATABASE'
      valueLength = buffer.readUInt8(position) * 2
      position++
      newValue = buffer.toString('ucs-2', position, position + valueLength)
      position += valueLength

      valueLength = buffer.readUInt8(position) * 2
      position++
      oldValue = buffer.toString('ucs-2', position, position + valueLength)
      position += valueLength
    else
      console.log('Unsupported ENVCHANGE type #{type}')

  token =
    length: length + 2,
    type: typeString,
    oldValue: oldValue,
    newValue: newValue
