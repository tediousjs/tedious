# s2.2.7.9, s2.2.7.10
TYPE = require("../token").TYPE

module.exports = ->
  @uint16le "length"
  @uint32le "number"
  @uint8 "state"
  @uint8 "class"
  @usVarchar "message"
  @bVarchar "serverName"
  @bVarchar "procName"
  @tap ->
    if @options.tdsVersion < '7_2'
      @uint16le "lineNumber"
    else
      @uint32le "lineNumber"
  @tap ->
    token =
      number: @vars.number
      state: @vars.state
      class: @vars.class
      message: @vars.message
      serverName: @vars.serverName
      procName: @vars.procName
      lineNumber: @vars.lineNumber

    if @vars.type == TYPE.ERROR
      token.name = 'ERROR'
      token.event = 'errorMessage'
    else
      token.name = 'INFO'
      token.event = 'infoMessage'

    @push token