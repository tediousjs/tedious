# s2.2.7.11

versions = require('../../tds-versions').versionsByValue

interfaceTypes =
  0: 'SQL_DFLT'
  1: 'SQL_TSQL'

module.exports = ->
  @uint16le "length"
  @uint8 "interfaceNumber"
  @uint32be "tdsVersionNumber"
  @bVarchar "progName"
  @tap "progVersion", ->
    @uint8 "major"
    @uint8 "minor"
    @uint8 "buildNumHi"
    @uint8 "buildNumLow"
  @tap ->
    @push
      name: 'LOGINACK'
      event: 'loginack'
      interface: interfaceTypes[@vars.interfaceNumber]
      tdsVersion: versions[@vars.tdsVersionNumber]
      progName: @vars.progName
      progVersion: @vars.progVersion
