require('../../src/buffertools')

Packet = require('../../src/packet').Packet
TYPE = require('../../src/packet').TYPE
isPacketComplete = require('../../src/packet').isPacketComplete

exports.createEmpty = (test) ->
  packet = new Packet(TYPE.PRELOGIN)

  test.ok(packet)
  test.ok(packet.buffer.equals(new Buffer([TYPE.PRELOGIN, 0, 0, 8, 0, 0, 1, 0])))

  test.done()

exports.last = (test) ->
  packet = new Packet(TYPE.PRELOGIN)
  test.ok(!packet.isLast())

  packet = new Packet(TYPE.PRELOGIN)
  test.ok(!packet.last())
  packet.last(true)
  test.ok(packet.last())

  test.done()

exports.packetId = (test) ->
  packet = new Packet(TYPE.PRELOGIN)
  test.strictEqual(packet.packetId(), 1)

  packet.packetId(2)
  test.strictEqual(packet.packetId(), 2)

  test.done()

exports.data = (test) ->
  data1 = new Buffer([0x01, 0x02, 0x03])
  data2 = new Buffer([0xFF, 0xFE])
  allData = Buffer.concat([data1, data2])

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

exports.createFromBuffer = (test) ->
  buffer = new Buffer([TYPE.PRELOGIN, 0x01, 0x00, 0x0A, 0, 0, 0, 0, 0x01, 0xFF])
  packet = new Packet(buffer)

  test.strictEqual(packet.length(), 0x0A)
  test.ok(packet.isLast())
  test.ok(packet.data().equals(new Buffer([0x01, 0xFF])))

  test.done()

exports.headerToString = (test) ->
  buffer = new Buffer([TYPE.PRELOGIN, 0x03, 0x00, 0x0A, 0, 1, 2, 3, 0x01, 0xFF])
  packet = new Packet(buffer)

  expectedText = '--type:0x12(PRELOGIN), status:0x03(EOM IGNORE), length:0x000A, spid:0x0001, packetId:0x02, window:0x03'
  test.strictEqual(packet.headerToString('--'), expectedText)

  test.done()

exports.dataToStringShort = (test) ->
  data = new Buffer([0x01, 0x02, 0x03])

  packet = new Packet(TYPE.PRELOGIN)
  packet.addData(data)

  expectedText = '--0000  010203  ...'
  test.strictEqual(packet.dataToString('--'), expectedText)

  test.done()

exports.dataExactLinesWorth = (test) ->
  dataLine1a = new Buffer([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07])
  dataLine1b = new Buffer([0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F])
  dataLine2a = new Buffer([0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17])
  dataLine2b = new Buffer([0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x1F])

  packet = new Packet(TYPE.PRELOGIN)
  packet.addData(dataLine1a)
  packet.addData(dataLine1b)
  packet.addData(dataLine2a)
  packet.addData(dataLine2b)

  expectedTextLine1a = '--0000  00010203 04050607 08090A0B 0C0D0E0F'
  expectedTextLine1b =        ' 10111213 14151617 18191A1B 1C1D1E1F'
  expectedTextLine1c = '  ........ ........ ........ ........'
  expectedText = expectedTextLine1a + expectedTextLine1b + expectedTextLine1c
  test.strictEqual(packet.dataToString('--'), expectedText)

  test.done()

exports.dataToStringMultipleLines = (test) ->
  dataLine1a = new Buffer([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07])
  dataLine1b = new Buffer([0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F])
  dataLine2a = new Buffer([0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17])
  dataLine2b = new Buffer([0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x1F])
  dataLine3a = new Buffer([0x30, 0x31, 0x32])

  packet = new Packet(TYPE.PRELOGIN)
  packet.addData(dataLine1a)
  packet.addData(dataLine1b)
  packet.addData(dataLine2a)
  packet.addData(dataLine2b)
  packet.addData(dataLine3a)

  expectedTextLine1a = '--0000  00010203 04050607 08090A0B 0C0D0E0F'
  expectedTextLine1b =        ' 10111213 14151617 18191A1B 1C1D1E1F'
  expectedTextLine1c = '  ........ ........ ........ ........\n'
  expectedTextLine2a = '--0020  303132'
  expectedTextLine2b = '  012'
  expectedText = expectedTextLine1a + expectedTextLine1b + expectedTextLine1c + expectedTextLine2a + expectedTextLine2b
  test.strictEqual(packet.dataToString('--'), expectedText)

  test.done()

exports.packetCompleteShorterThanHeader = (test) ->
  buffer = new Buffer(7)
  test.ok(!isPacketComplete(buffer))

  test.done()

exports.packetCompleteJustHeader = (test) ->
  buffer = new Packet(TYPE.PRELOGIN).buffer

  test.ok(isPacketComplete(buffer))

  test.done()

exports.packetCompleteTooShort = (test) ->
  buffer = new Buffer([0x00, 0x00, 0x00, 0x0C, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])

  test.ok(!isPacketComplete(buffer))

  test.done()

exports.packetCompleteLongEnough = (test) ->
  buffer = new Buffer([0x00, 0x00, 0x00, 0x0C, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])

  test.ok(isPacketComplete(buffer))

  test.done()
