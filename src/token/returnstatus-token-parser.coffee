# s2.2.7.16

parser = (buffer) ->
  value = buffer.readInt32LE()

  token =
    name: 'RETURNSTATUS'
    event: 'returnStatus'
    value: value

module.exports = parser
