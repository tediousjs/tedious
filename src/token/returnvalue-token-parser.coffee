# s2.2.7.16

metadataParse = require('../metadata-parser')
valueParse = require('../value-parser')

parser = (buffer, colMetadata, tdsVersion) ->
  paramOrdinal = buffer.readUInt16LE()
  paramName = buffer.readBVarchar()
  status = buffer.readUInt8()
  metadata = metadataParse(buffer, tdsVersion)
  value = valueParse(buffer, metadata)

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
