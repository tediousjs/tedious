parser = require('../../../src/token/loginack-token-parser')
ReadableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').ReadableTrackingBuffer
WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer

module.exports.info = (test) ->
  interfaceType = 1
  version = 0x72090002
  progName = 'prog'
  progVersion =
    major: 1
    minor: 2
    buildNumHi: 3
    buildNumLow: 4

  buffer = new WritableTrackingBuffer(50, 'ucs2')

  buffer.writeUInt16LE(0)         # Length written later
  buffer.writeUInt8(interfaceType)
  buffer.writeUInt32BE(version)
  buffer.writeBVarchar(progName)
  buffer.writeUInt8(progVersion.major)
  buffer.writeUInt8(progVersion.minor)
  buffer.writeUInt8(progVersion.buildNumHi)
  buffer.writeUInt8(progVersion.buildNumLow)

  data = buffer.data
  data.writeUInt16LE(data.length - 2, 0)
  #console.log(buffer)

  token = parser(new ReadableTrackingBuffer(data, 'ucs2'))
  #console.log(token)

  test.strictEqual(token.interface, 'SQL_TSQL')
  test.strictEqual(token.tdsVersion, '7_2')
  test.strictEqual(token.progName, progName)
  test.deepEqual(token.progVersion, progVersion)

  test.done()
