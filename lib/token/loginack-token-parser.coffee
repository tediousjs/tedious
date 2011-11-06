# s2.2.7.11

versions = require('../tds-versions').versionsByValue

interfaces =
  0: 'SQL_DFLT'
  1: 'SQL_TSQL'

parser = (buffer, position) ->
  if buffer.length - position < 3
    # Not long enough to contain length and type bytes.
    return false

  length = buffer.readUInt16LE(position)
  position += 2
  if (buffer.length - position < length)
    # Not long enough for the extracted length
    return false

  interfaceNumber = buffer.readUInt8(position)
  interface = interfaces[interfaceNumber]
  if !interface
    error = "Unknown LOGINACK Interface #{interfaceNumber} at offset #{position}"
  position++

  tdsVersionNumber = buffer.readUInt32BE(position)
  tdsVersion = versions[tdsVersionNumber]
  if !tdsVersion
    error = "Unknown LOGINACK TDSVersion #{tdsVersionNumber} at offset #{position}"
  position += 4

  valueLength = buffer.readUInt8(position) * 2
  position++
  progName = buffer.toString('ucs-2', position, position + valueLength)
  position += valueLength
  
  progVersion =
    major: buffer.readUInt8(position++)
    minor: buffer.readUInt8(position++)
    buildNumHi: buffer.readUInt8(position++)
    buildNumLow: buffer.readUInt8(position++)

  if error
    token =
      name: 'LOGINACK'
      error: error
  else
    token =
      name: 'LOGINACK'
      length: length + 2
      event: 'loginack'
      interface: interface
      tdsVersion: tdsVersion
      progName: progName
      progVersion: progVersion

module.exports = parser
