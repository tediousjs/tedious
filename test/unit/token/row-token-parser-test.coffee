parser = require('../../../src/token/row-token-parser')
dataTypeByName = require('../../../src/data-type').typeByName
ReadableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').ReadableTrackingBuffer
WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer

module.exports.oneColumn = (test) ->
  colMetaData = [
    type: dataTypeByName.Null
  ]

  buffer = new WritableTrackingBuffer(0, 'ucs2')

  parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData, (token) ->
    test.strictEqual(token.columns.length, 1)
    test.strictEqual(token.columns[0].value, null)
    test.strictEqual(token.columns[0].metadata, colMetaData[0])

    test.done()
  )

module.exports.threeColumns = (test) ->
  colMetaData = [
    {type: dataTypeByName.Null}
    {type: dataTypeByName.Int}
    {type: dataTypeByName.NVarChar}
  ]


  value0 = null
  value1 = 3
  value2 = 'abc'

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  # int
  buffer.writeUInt32LE(value1)
  # nvarchar
  buffer.writeUInt16LE(value2.length * 2)
  buffer.writeString(value2)

  parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData, (token) ->
    test.strictEqual(token.columns.length, 3)

    test.strictEqual(token.columns[0].value, value0)
    test.strictEqual(token.columns[0].metadata, colMetaData[0])

    test.strictEqual(token.columns[1].value, value1)
    test.strictEqual(token.columns[1].metadata, colMetaData[1])

    test.strictEqual(token.columns[2].value, value2)
    test.strictEqual(token.columns[2].metadata, colMetaData[2])

    test.done()
  )
