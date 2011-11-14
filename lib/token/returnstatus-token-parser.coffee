# s2.2.7.15

parser = (buffer, position) ->
  startPosition = position

  value = buffer.readUInt32LE(position)
  position += 4

  token =
    name: 'RETURNSTATUS'
    length: position - startPosition
    event: 'returnStatus'
    value: value

module.exports = parser
