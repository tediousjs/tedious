require('../../src/buffertools')

STATUS = require('../../src/packet').STATUS
TYPE = require('../../src/packet').TYPE
decodeHeader = require('../../src/packet').decodeHeader
encodeHeader = require('../../src/packet').encodeHeader
dataToString = require('../../src/packet').dataToString
headerToString = require('../../src/packet').headerToString

exports.decodePacketHeader = (test) ->
  buffer = new Buffer([
    TYPE.SQL_BATCH
    STATUS.NORMAL
    0x00, 0x0a          # length
    0x00, 0x03          # SPID
    0x04                # packet id
    0x0000              # window
  ])

  header = decodeHeader(buffer)

  test.strictEqual(header.type, TYPE.SQL_BATCH)
  test.strictEqual(header.status, STATUS.NORMAL)
  test.ok(!header.endOfMessage)
  test.strictEqual(header.length, 10)
  test.strictEqual(header.payloadLength, 2)
  test.strictEqual(header.spid, 3)
  test.strictEqual(header.packetId, 4)
  test.strictEqual(header.window, 0)
  test.done()

exports.decodePacketHeaderEndOfMessage = (test) ->
  buffer = new Buffer([
    0x00
    STATUS.EOM
    0x00, 0x08          # length
    0x00, 0x00          # SPID
    0x00                # packet id
    0x0000              # window
  ])

  header = decodeHeader(buffer)

  test.ok(header.endOfMessage)
  test.done()

exports.encodePacketHeader = (test) ->
  buffer = encodeHeader(TYPE.PRELOGIN, STATUS.EOM, 2, 256 + 3)
  expectedBuffer = new Buffer([TYPE.PRELOGIN, 0x01, 0x00, 0x0A, 0x00, 0x00, 0x03, 0x00])

  test.deepEqual(buffer, expectedBuffer)
  test.done()

exports.packetHeaderToString = (test) ->
  header =
    type: TYPE.PRELOGIN
    status: STATUS.EOM | STATUS.IGNORE
    length: 10
    spid: 1
    packetId: 2
    window: 3

  expectedText = '--type:0x12(PRELOGIN), status:0x03(EOM IGNORE), length:0x000A, spid:0x0001, packetId:0x02, window:0x03'

  test.strictEqual(headerToString(header, '--'), expectedText)
  test.done()

exports.dataToStringShort = (test) ->
  data = new Buffer([0x01, 0x02, 0x03])
  expectedText = '--0000  010203  ...'

  test.strictEqual(dataToString(data, '--'), expectedText)
  test.done()

exports.dataToStringExactNumberOfLines = (test) ->
  data = new Buffer([
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07    # Line 1
    0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F
    0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17    # Line 2
    0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x1F
  ])

  expectedTextLine1a = '--0000  00010203 04050607 08090A0B 0C0D0E0F'
  expectedTextLine1b =        ' 10111213 14151617 18191A1B 1C1D1E1F'
  expectedTextLine1c = '  ........ ........ ........ ........'
  expectedText = expectedTextLine1a + expectedTextLine1b + expectedTextLine1c

  test.strictEqual(dataToString(data, '--'), expectedText)
  test.done()

exports.dataToStringMultipleLines = (test) ->
  data = new Buffer([
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07    # Line 1
    0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F
    0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17    # Line 2
    0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x1F
    0x30, 0x31, 0x32                                  # Line 3
  ])

  expectedTextLine1a = '--0000  00010203 04050607 08090A0B 0C0D0E0F'
  expectedTextLine1b =        ' 10111213 14151617 18191A1B 1C1D1E1F'
  expectedTextLine1c = '  ........ ........ ........ ........\n'
  expectedTextLine2a = '--0020  303132'
  expectedTextLine2b = '  012'
  expectedText = expectedTextLine1a + expectedTextLine1b + expectedTextLine1c + expectedTextLine2a + expectedTextLine2b

  test.strictEqual(dataToString(data, '--'), expectedText)
  test.done()
