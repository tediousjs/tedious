# s2.2.7.11

versions = require('../tds-versions').versionsByValue

interfaceTypes =
  0: 'SQL_DFLT'
  1: 'SQL_TSQL'

parser = (buffer) ->
  length = buffer.readUInt16LE()

  interfaceNumber = buffer.readUInt8()
  interfaceType = interfaceTypes[interfaceNumber]
  tdsVersionNumber = buffer.readUInt32BE()
  tdsVersion = versions[tdsVersionNumber]
  progName = buffer.readBVarchar()

  progVersion =
    major: buffer.readUInt8()
    minor: buffer.readUInt8()
    buildNumHi: buffer.readUInt8()
    buildNumLow: buffer.readUInt8()

  # Return token
  name: 'LOGINACK'
  event: 'loginack'
  interface: interfaceType
  tdsVersion: tdsVersion
  progName: progName
  progVersion: progVersion

module.exports = parser
