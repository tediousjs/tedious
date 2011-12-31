# s2.2.7.15

parser = (buffer) ->
  value = buffer.readUInt32LE()

  token =
    name: 'RETURNSTATUS'
    event: 'returnStatus'
    value: value

module.exports = parser
