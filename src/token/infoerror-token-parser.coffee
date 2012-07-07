# s2.2.7.9, s2.2.7.10

parser = (buffer, tdsVersion) ->
  length = buffer.readUInt16LE()
  number = buffer.readUInt32LE()
  state = buffer.readUInt8()
  class_ = buffer.readUInt8()
  message = buffer.readUsVarchar()
  serverName = buffer.readBVarchar()
  procName = buffer.readBVarchar()
  if tdsVersion < '7_2'
    lineNumber = buffer.readUInt16LE()
  else
    lineNumber = buffer.readUInt32LE()

  token =
    number: number
    state: state
    class: class_
    message: message
    serverName: serverName
    procName: procName
    lineNumber: lineNumber

infoParser = (buffer, colMetadata, tdsVersion) ->
  token = parser(buffer, tdsVersion)
  token.name = 'INFO'
  token.event = 'infoMessage'

  token

errorParser = (buffer, colMetadata, tdsVersion) ->
  token = parser(buffer, tdsVersion)
  token.name = 'ERROR'
  token.event = 'errorMessage'

  token

exports.infoParser = infoParser
exports.errorParser = errorParser
