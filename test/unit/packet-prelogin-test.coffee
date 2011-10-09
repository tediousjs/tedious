PreloginPacket = require('../../lib/packet-prelogin').PreloginPacket
TYPE = require('../../lib/packet').TYPE

exports.test = (test) ->
  packet = new PreloginPacket()

  #console.log(packet.payloadString())

  test.strictEqual(packet.version.major, 0)
  test.strictEqual(packet.version.minor, 0)
  test.strictEqual(packet.version.patch, 0)
  test.strictEqual(packet.version.trivial, 1)
  test.strictEqual(packet.version.subbuild, 1)

  test.strictEqual(packet.encryptionString, 'NOT_SUP')
  test.strictEqual(packet.instance, 0)
  test.strictEqual(packet.threadId, 0)
  test.strictEqual(packet.marsString, 'OFF')

  test.done()
