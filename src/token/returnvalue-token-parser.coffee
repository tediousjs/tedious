# s2.2.7.16

metadataParse = require('../metadata-parser')
valueParse = require('../value-parser')

parser = (buffer, callback) ->
  token =
    name: 'RETURNVALUE'
    event: 'returnValue'

  buffer.readMultiple(
    paramOrdinal: buffer.readUInt16LE
    paramName: [buffer.readBVarchar, ['ucs2']]
    status: buffer.readUInt8
    , (values) ->
      token.paramOrdinal = values.paramOrdinal
      token.paramName = values.paramName
      token.status = values.status

      metadataParse(buffer, (metadata) ->
        token.metadata = metadata

        valueParse(buffer, metadata, (value) ->
          token.value = value
          callback(token)
        )
      )
  )

module.exports = parser
