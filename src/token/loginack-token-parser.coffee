# s2.2.7.11

versions = require('../tds-versions').versionsByValue

interfaceTypes =
  0: 'SQL_DFLT'
  1: 'SQL_TSQL'

parser = (buffer, callback) ->
  token =
    name: 'LOGINACK'
    event: 'loginack'

  buffer.readMultiple(
    length: buffer.readUInt16LE
    interfaceNumber: buffer.readUInt8
    tdsVersionNumber: buffer.readUInt32BE
    progName: [buffer.readBVarchar, ['ucs2']]
    , (tokenValues) ->
      token.interface = interfaceTypes[tokenValues.interfaceNumber]
      if !token.interface
        throw new Error("Unknown LOGINACK Interface #{tokenValues.interfaceNumber} at offset #{buffer.position}")

      token.tdsVersion = versions[tokenValues.tdsVersionNumber]
      if !token.tdsVersion
        throw new Error("Unknown LOGINACK TDSVersion #{tokenValues.tdsVersionNumber} at offset #{buffer.position}")

      token.progName = tokenValues.progName

      buffer.readMultiple(
        major: buffer.readUInt8
        minor: buffer.readUInt8
        buildNumHi: buffer.readUInt8
        buildNumLow: buffer.readUInt8
        , (progVersion) ->
          token.progVersion = progVersion

          callback(token)
      )
  )

module.exports = parser
