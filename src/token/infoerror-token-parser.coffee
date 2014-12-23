# s2.2.7.9, s2.2.7.10

parseToken = (parser, options) ->
  length = yield parser.readUInt16LE()
  number = yield parser.readUInt32LE()
  state = yield parser.readUInt8()
  clazz = yield parser.readUInt8()
  message = yield from parser.readUsVarChar()
  serverName = yield from parser.readBVarChar()
  procName = yield from parser.readBVarChar()

  if options.tdsVersion < '7_2'
    lineNumber = yield parser.readUInt16LE()
  else
    lineNumber = yield parser.readUInt32LE()

  token =
    number: number
    state: state
    class: clazz
    message: message
    serverName: serverName
    procName: procName
    lineNumber: lineNumber

infoParser = (parser, colMetadata, options) ->
  token = yield from parseToken(parser, options)
  token.name = 'INFO'
  token.event = 'infoMessage'

  token

errorParser = (parser, colMetadata, options) ->
  token = yield from parseToken(parser, options)
  token.name = 'ERROR'
  token.event = 'errorMessage'

  token

exports.infoParser = infoParser
exports.errorParser = errorParser
