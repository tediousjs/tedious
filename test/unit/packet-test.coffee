require('buffertools')

Packet = require('../../lib/packet').Packet
TYPE = require('../../lib/packet').TYPE

exports.createEmpty = (test) ->
  packet = new Packet(TYPE.PRELOGIN)

  test.ok(packet)
  test.ok(packet.buffer.equals(new Buffer([TYPE.PRELOGIN, 0, 0, 8, 0, 0, 0, 0])))

  test.done()

exports.last = (test) ->
  packet = new Packet(TYPE.PRELOGIN)
  test.ok(!packet.isLast())

  packet = new Packet(TYPE.PRELOGIN)
  packet.setLast()
  test.ok(packet.isLast())

  test.done()

exports.data = (test) ->
  data1 = new Buffer([0x01, 0x02, 0x03])
  data2 = new Buffer([0xFF, 0xFE])
  allData = data1.concat(data2)

  packet = new Packet(TYPE.PRELOGIN)
  test.strictEqual(packet.length(), 8)
  test.ok(packet.data().equals(new Buffer(0)))

  packet.addData(data1)
  test.strictEqual(packet.length(), 8 + data1.length)
  test.ok(packet.data().equals(data1))

  packet.addData(data2)
  test.strictEqual(packet.length(), 8 + allData.length)
  test.ok(packet.data().equals(allData))

  test.done()
