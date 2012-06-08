# s2.2.7.15

parser = (buffer, callback) ->
  buffer.readUInt32LE((value) ->
    token =
      name: 'RETURNSTATUS'
      event: 'returnStatus'
      value: value

    callback(token)
  )

module.exports = parser
