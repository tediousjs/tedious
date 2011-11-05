parser = require('../../lib/loginack-token-parser')
TYPE = require('../../lib/token').TYPE

module.exports.info = (test) ->
  interface = 1
  version = 0x72090002
  progName = 'prog'
  progVersion =
    major: 1
    minor: 2
    buildNumHi: 3
    buildNumLow: 4

  buffer = new Buffer(1 + 2 + 1 + 4 +
    1 + (progName.length * 2) + 4)
  pos = 0;

  buffer.writeUInt8(TYPE.LOGINACK, pos); pos++
  buffer.writeUInt16LE(buffer.length - (1 + 2), pos); pos += 2
  buffer.writeUInt8(interface, pos); pos++
  buffer.writeUInt32BE(version, pos); pos += 4

  buffer.writeUInt8(progName.length, pos); pos++
  buffer.write(progName, pos, 'ucs-2'); pos += (progName.length * 2)

  buffer.writeUInt8(progVersion.major, pos); pos++
  buffer.writeUInt8(progVersion.minor, pos); pos++
  buffer.writeUInt8(progVersion.buildNumHi, pos); pos++
  buffer.writeUInt8(progVersion.buildNumLow, pos); pos++

  #console.log(buffer)

  token = parser(buffer, 1)
  #console.log(token)

  test.strictEqual(token.length, buffer.length - 1)
  test.strictEqual(token.interface, 'SQL_TSQL')
  test.strictEqual(token.tdsVersion, '7_2')
  test.strictEqual(token.progName, progName)
  test.deepEqual(token.progVersion, progVersion)

  test.done()
