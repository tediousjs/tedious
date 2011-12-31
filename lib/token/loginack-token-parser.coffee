# s2.2.7.11

versions = require('../tds-versions').versionsByValue

interfaces =
  0: 'SQL_DFLT'
  1: 'SQL_TSQL'

parser = (buffer) ->
  length = buffer.readUInt16LE()

  interfaceNumber = buffer.readUInt8()
  interface = interfaces[interfaceNumber]
  if !interface
    error = "Unknown LOGINACK Interface #{interfaceNumber} at offset #{buffer.position}"

  tdsVersionNumber = buffer.readUInt32BE()
  tdsVersion = versions[tdsVersionNumber]
  if !tdsVersion
    error = "Unknown LOGINACK TDSVersion #{tdsVersionNumber} at offset #{buffer.position}"

  progName = buffer.readBVarchar()

  progVersion =
    major: buffer.readUInt8()
    minor: buffer.readUInt8()
    buildNumHi: buffer.readUInt8()
    buildNumLow: buffer.readUInt8()

  if error
    token =
      name: 'LOGINACK'
      error: error
  else
    token =
      name: 'LOGINACK'
      event: 'loginack'
      interface: interface
      tdsVersion: tdsVersion
      progName: progName
      progVersion: progVersion

module.exports = parser
