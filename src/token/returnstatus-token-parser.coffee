# s2.2.7.16

module.exports = (parser) ->
  value = yield parser.readInt32LE()

  token =
    name: 'RETURNSTATUS'
    event: 'returnStatus'
    value: value
