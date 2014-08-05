convertLEBytesToString = require('../../../src/tracking-buffer/bigint').convertLEBytesToString
numberToInt64LE = require('../../../src/tracking-buffer/bigint').numberToInt64LE

module.exports.zero = (test) ->
  test.strictEqual('0', convertLEBytesToString(new Buffer([0, 0, 0, 0, 0, 0, 0, 0])))

  test.done()

module.exports.smallPositive = (test) ->
  test.strictEqual('1', convertLEBytesToString(new Buffer([1, 0, 0, 0, 0, 0, 0, 0])))
  test.strictEqual('2', convertLEBytesToString(new Buffer([2, 0, 0, 0, 0, 0, 0, 0])))

  test.done()

module.exports.smallNegative = (test) ->
  test.strictEqual('-1', convertLEBytesToString(new Buffer([255, 255, 255, 255, 255, 255, 255, 255])))
  test.strictEqual('-2', convertLEBytesToString(new Buffer([254, 255, 255, 255, 255, 255, 255, 255])))

  test.done()

module.exports.bigPositive = (test) ->
  test.strictEqual('9223372036854775807', convertLEBytesToString(new Buffer([255, 255, 255, 255, 255, 255, 255, 127])))

  test.done()

module.exports.bigNegative = (test) ->
  test.strictEqual('-9223372036854775808', convertLEBytesToString(new Buffer([0, 0, 0, 0, 0, 0, 0, 128])))

  test.done()

module.exports.powersOf10 = (test) ->
  test.strictEqual('10', convertLEBytesToString(new Buffer([10, 0, 0, 0, 0, 0, 0, 0])))
  test.strictEqual('100', convertLEBytesToString(new Buffer([100, 0, 0, 0, 0, 0, 0, 0])))
  test.strictEqual('1000', convertLEBytesToString(new Buffer([232, 3, 0, 0, 0, 0, 0, 0])))
  test.strictEqual('10000', convertLEBytesToString(new Buffer([16, 39, 0, 0, 0, 0, 0, 0])))
  
  test.done()

module.exports.toInt64LE= (test) ->
  assertBuffer(test, numberToInt64LE(-3500000000), [0x00, 0x3d, 0x62, 0x2f, 0xff, 0xff, 0xff, 0xff])
  assertBuffer(test, numberToInt64LE(3500000000), [0x00, 0xc3, 0x9d, 0xd0, 0x00, 0x00, 0x00, 0x00])
  assertBuffer(test, numberToInt64LE(-2), [0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
  assertBuffer(test, numberToInt64LE(2), [0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
  assertBuffer(test, numberToInt64LE(0), [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
  assertBuffer(test, numberToInt64LE(-5000000000), [0x00, 0x0e, 0xfa, 0xd5, 0xfe, 0xff, 0xff, 0xff])
  assertBuffer(test, numberToInt64LE(5000000000), [0x00, 0xf2, 0x05, 0x2a, 0x01, 0x00, 0x00, 0x00])
  assertBuffer(test, numberToInt64LE(5201683247893), [0x15, 0x73, 0x7b, 0x1c, 0xbb, 0x04, 0x00, 0x00])
  assertBuffer(test, numberToInt64LE(-5201683247893), [0xeb, 0x8c, 0x84, 0xe3, 0x44, 0xfb, 0xff, 0xff])
  
  test.done()

assertBuffer = (test, actual, expected) ->
  for i in [0..actual.length - 1]
    if (actual[i] != expected[i])
      console.log('actual  ', actual)
      console.log('expected', new Buffer(expected))
      test.ok(false)