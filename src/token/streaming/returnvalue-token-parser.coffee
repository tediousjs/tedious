# s2.2.7.16

metadataParse = require('./metadata-parser')
valueParse = require('./value-parser')

module.exports = ->
  @uint16le "paramOrdinal"
  @bVarchar "paramName"
  @uint8 "status"
  metadataParse.call(@)

  @tap ->
    valueParse.call(@, @vars.metadata)

  @tap ->
    if @vars.paramName.charAt(0) == '@'
      @vars.paramName = @vars.paramName.slice(1)

    @push
      name: 'RETURNVALUE'
      event: 'returnValue'
      paramOrdinal: @vars.paramOrdinal
      paramName: @vars.paramName
      metadata: @vars.metadata
      value: @vars.value
