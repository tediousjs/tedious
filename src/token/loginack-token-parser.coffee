# s2.2.7.11

versions = require('../tds-versions').versionsByValue

interfaceTypes =
  0: 'SQL_DFLT'
  1: 'SQL_TSQL'

module.exports = (parser) ->
  length = yield parser.readUInt16LE()

  interfaceNumber = yield parser.readUInt8()
  interfaceType = interfaceTypes[interfaceNumber]
  tdsVersionNumber = yield parser.readUInt32BE()
  tdsVersion = versions[tdsVersionNumber]
  progName = yield from parser.readBVarChar()

  progVersion =
    major: yield parser.readUInt8()
    minor: yield parser.readUInt8()
    buildNumHi: yield parser.readUInt8()
    buildNumLow: yield parser.readUInt8()

  # Return token
  name: 'LOGINACK'
  event: 'loginack'
  interface: interfaceType
  tdsVersion: tdsVersion
  progName: progName
  progVersion: progVersion
