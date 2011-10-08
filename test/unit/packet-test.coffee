require('buffertools')

Packet = require('../../lib/packet').Packet
TYPE = require('../../lib/packet').TYPE

exports.createEmpty = (test) ->
  packet = new Packet(TYPE.PRELOGIN)

  test.ok(packet)
  test.ok(packet.buffer.equals(new Buffer([TYPE.PRELOGIN, 0, 0, 8, 0, 0, 0, 0])))

  test.done()

exports.createLast = (test) ->
  packet = new Packet(TYPE.PRELOGIN)
  packet.setLast()
  
  test.strictEqual(packet.buffer[1], 0x01)

  test.done()
