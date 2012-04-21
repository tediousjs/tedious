convertLEBytesToString = require('../../../src/tracking-buffer/bigint').convertLEBytesToString

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
