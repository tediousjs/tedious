# s2.2.7.9, s2.2.7.10

parser = (buffer, callback) ->
  buffer.readMultiple(
    length: buffer.readUInt16LE
    number: buffer.readUInt32LE
    state: buffer.readUInt8
    "class": buffer.readUInt8
    message: [buffer.readUsVarchar, ['ucs2']]
    serverName: [buffer.readBVarchar, ['ucs2']]
    procName: [buffer.readBVarchar, ['ucs2']]
    lineNumber: buffer.readUInt32LE
    , callback
  )

infoParser = (buffer, callback) ->
  parser(buffer, (token) ->
    token.name = 'INFO'
    token.event = 'infoMessage'

    callback(token)
  )

errorParser = (buffer, callback) ->
  parser(buffer, (token) ->
    token.name = 'ERROR'
    token.event = 'errorMessage'

    callback(token)
  )

exports.infoParser = infoParser
exports.errorParser = errorParser
