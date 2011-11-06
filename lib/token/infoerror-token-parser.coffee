parser = (buffer, position) ->
  if buffer.length - position < 3
    # Not long enough to contain length and type bytes.
    return false

  length = buffer.readUInt16LE(position)
  position += 2
  if (buffer.length - position < length)
    # Not long enough for the extracted length
    return false

  number = buffer.readUInt32LE(position)
  position += 4

  state = buffer.readUInt8(position)
  position++

  class_ = buffer.readUInt8(position)
  position++

  valueLength = buffer.readUInt16LE(position) * 2
  position += 2
  message = buffer.toString('ucs-2', position, position + valueLength)
  position += valueLength

  valueLength = buffer.readUInt8(position) * 2
  position++
  serverName = buffer.toString('ucs-2', position, position + valueLength)
  position += valueLength

  valueLength = buffer.readUInt8(position) * 2
  position++
  procName = buffer.toString('ucs-2', position, position + valueLength)
  position += valueLength

  lineNumber = buffer.readUInt32LE(position)
  position += 4

  token =
    length: length + 2
    number: number
    state: state
    class: class_
    message: message
    serverName: serverName
    procName: procName
    lineNumber: lineNumber

infoParser = (buffer, position) ->
  token = parser(buffer, position)
  token.event = 'infoMessage'

  token

errorParser = (buffer, position) ->
  token = parser(buffer, position)
  token.event = 'errorMessage'

  token

exports.infoParser = infoParser
exports.errorParser = errorParser
