parser = require('../../../src/token/order-token-parser')
dataTypeByName = require('../../../src/data-type').typeByName
ReadableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').ReadableTrackingBuffer
WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer

module.exports.oneColumn = (test) ->
  numberOfColumns = 1
  length = numberOfColumns * 2
  column = 3

  buffer = new WritableTrackingBuffer(50, 'ucs2')

  buffer.writeUInt16LE(length)
  buffer.writeUInt16LE(column)
  #console.log(buffer.data)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'))
  #console.log(token)

  test.strictEqual(token.orderColumns.length, 1)
  test.strictEqual(token.orderColumns[0], column)

  test.done()

module.exports.twoColumns = (test) ->
  numberOfColumns = 2
  length = numberOfColumns * 2
  column1 = 3
  column2 = 4

  buffer = new WritableTrackingBuffer(50, 'ucs2')

  buffer.writeUInt16LE(length)
  buffer.writeUInt16LE(column1)
  buffer.writeUInt16LE(column2)
  #console.log(buffer.data)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'))
  #console.log(token)

  test.strictEqual(token.orderColumns.length, 2)
  test.strictEqual(token.orderColumns[0], column1)
  test.strictEqual(token.orderColumns[1], column2)

  test.done()
