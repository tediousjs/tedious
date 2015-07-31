# s2.2.7.16

metadataParse = require('../metadata-parser')
valueParse = require('../value-parser')

module.exports = (parser, colMetadata, options) ->
  paramOrdinal = yield parser.readUInt16LE()
  paramName = yield from parser.readBVarChar()
  status = yield parser.readUInt8()
  metadata = yield from metadataParse(parser, options)
  value = yield from valueParse(parser, metadata, options)

  if paramName.charAt(0) == '@'
    paramName = paramName.slice(1)

  token =
    name: 'RETURNVALUE'
    event: 'returnValue'
    paramOrdinal: paramOrdinal
    paramName: paramName
    metadata: metadata
    value: value
