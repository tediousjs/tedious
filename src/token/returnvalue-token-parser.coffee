# s2.2.7.16

metadataParse = require('../metadata-parser')
valueParse = require('../value-parser')

parser = (buffer, colMetadata, options) ->
  paramOrdinal = buffer.readUInt16LE()
  paramName = buffer.readBVarchar()
  status = buffer.readUInt8()
  metadata = metadataParse(buffer, options)
  value = valueParse(buffer, metadata, options)

  if paramName.charAt(0) == '@'
    paramName = paramName.slice(1)

  token =
    name: 'RETURNVALUE'
    event: 'returnValue'
    paramOrdinal: paramOrdinal
    paramName: paramName
    metadata: metadata
    value: value

module.exports = parser
