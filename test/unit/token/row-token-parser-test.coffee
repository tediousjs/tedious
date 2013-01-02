parser = require('../../../src/token/row-token-parser')
dataTypeByName = require('../../../src/data-type').typeByName
ReadableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').ReadableTrackingBuffer
WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer

module.exports.null = (test) ->
  colMetaData = [type: dataTypeByName.Null]

  buffer = new WritableTrackingBuffer(0, 'ucs2')

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].value, null)
  test.strictEqual(token.columns[0].metadata, colMetaData[0])

  test.done()

module.exports.int = (test) ->
  colMetaData = [type: dataTypeByName.Int]
  value = 3

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeUInt32LE(value)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].value, value)
  test.strictEqual(token.columns[0].metadata, colMetaData[0])

  test.done()

module.exports.bigint = (test) ->
  colMetaData = [{type: dataTypeByName.BigInt},
    {type: dataTypeByName.BigInt}]

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([
    1,0,0,0,0,0,0,0,
    255,255,255,255,255,255,255,127]))

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)

  test.strictEqual(token.columns.length, 2)
  test.strictEqual("1", token.columns[0].value)
  test.strictEqual("9223372036854775807", token.columns[1].value)

  test.done()

module.exports.real = (test) ->
  colMetaData = [type: dataTypeByName.Real]
  value = 9.5

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([0x00, 0x00, 0x18, 0x41]))

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].value, value)
  test.strictEqual(token.columns[0].metadata, colMetaData[0])

  test.done()

module.exports.float = (test) ->
  colMetaData = [type: dataTypeByName.Float]
  value = 9.5

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x23, 0x40]))

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].value, value)
  test.strictEqual(token.columns[0].metadata, colMetaData[0])

  test.done()

module.exports.money = (test) ->
  colMetaData = [
    {type: dataTypeByName.SmallMoney}
    {type: dataTypeByName.Money}
    {type: dataTypeByName.MoneyN}
    {type: dataTypeByName.MoneyN}
    {type: dataTypeByName.MoneyN}
    {type: dataTypeByName.MoneyN}
  ]
  value = 123.456
  valueLarge = 123456789012345.11

  buffer = new WritableTrackingBuffer(0)
  buffer.writeBuffer(new Buffer([0x80, 0xd6, 0x12, 0x00]))
  buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x80, 0xd6, 0x12, 0x00]))
  buffer.writeBuffer(new Buffer([0x00]))
  buffer.writeBuffer(new Buffer([0x04, 0x80, 0xd6, 0x12, 0x00]))
  buffer.writeBuffer(new Buffer([0x08, 0x00, 0x00, 0x00, 0x00, 0x80, 0xd6, 0x12, 0x00]))
  buffer.writeBuffer(new Buffer([0x08, 0xf4, 0x10, 0x22, 0x11, 0xdc, 0x6a, 0xe9, 0x7d]))

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 6)
  test.strictEqual(token.columns[0].value, value)
  test.strictEqual(token.columns[1].value, value)
  test.strictEqual(token.columns[2].value, null)
  test.strictEqual(token.columns[3].value, value)
  test.strictEqual(token.columns[4].value, value)
  test.strictEqual(token.columns[5].value, valueLarge)

  test.done()

module.exports.varCharWithoutCodepage = (test) ->
  colMetaData = [
    type: dataTypeByName.VarChar
    collation:
      codepage: undefined
  ]
  value = 'abcde'

  buffer = new WritableTrackingBuffer(0, 'ascii')
  buffer.writeUsVarchar(value)
  #console.log(buffer.data)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].value, value)
  test.strictEqual(token.columns[0].metadata, colMetaData[0])

  test.done()

module.exports.varCharWithCodepage = (test) ->
  colMetaData = [
    type: dataTypeByName.VarChar
    collation:
      codepage: 'WINDOWS-1252'
  ]
  value = 'abcdé'

  buffer = new WritableTrackingBuffer(0, 'ascii')
  buffer.writeUsVarchar(value)
  #console.log(buffer.data)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].value, value)
  test.strictEqual(token.columns[0].metadata, colMetaData[0])

  test.done()

module.exports.nVarChar = (test) ->
  colMetaData = [type: dataTypeByName.NVarChar]
  value = 'abc'

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeUInt16LE(value.length * 2)
  buffer.writeString(value)
  #console.log(buffer.data)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].value, value)
  test.strictEqual(token.columns[0].metadata, colMetaData[0])

  test.done()

module.exports.varBinary = (test) ->
  colMetaData = [type: dataTypeByName.VarBinary]
  value = [0x12, 0x34]

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeUInt16LE(value.length)
  buffer.writeBuffer(new Buffer(value))
  #console.log(buffer.data)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.deepEqual(token.columns[0].value, value)
  test.strictEqual(token.columns[0].metadata, colMetaData[0])

  test.done()

module.exports.binary = (test) ->
  colMetaData = [type: dataTypeByName.Binary]
  value = [0x12, 0x34]

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeUInt16LE(value.length)
  buffer.writeBuffer(new Buffer(value))
  #console.log(buffer.data)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.deepEqual(token.columns[0].value, value)
  test.strictEqual(token.columns[0].metadata, colMetaData[0])

  test.done()

module.exports.varCharMaxNull = (test) ->
  colMetaData = [
    type: dataTypeByName.VarChar
    dataLength: 65535
    collation:
      codepage: undefined
  ]

  buffer = new WritableTrackingBuffer(0, 'ascii')
  buffer.writeBuffer(new Buffer([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]))
  #console.log(buffer.data)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].value, null)
  test.strictEqual(token.columns[0].metadata, colMetaData[0])

  test.done()

module.exports.varCharMaxUnknownLength = (test) ->
  colMetaData = [
    type: dataTypeByName.VarChar
    dataLength: 65535
    collation:
      codepage: undefined
  ]
  value = 'abcdef'

  buffer = new WritableTrackingBuffer(0, 'ascii')
  buffer.writeBuffer(new Buffer([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]))
  buffer.writeUInt32LE(3)
  buffer.writeString(value.slice(0, 3))
  buffer.writeUInt32LE(3)
  buffer.writeString(value.slice(3, 6))
  buffer.writeUInt32LE(0)
  #console.log(buffer.data)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].value, value)
  test.strictEqual(token.columns[0].metadata, colMetaData[0])

  test.done()

module.exports.varCharMaxKnownLength = (test) ->
  colMetaData = [
    type: dataTypeByName.VarChar
    dataLength: 65535
    collation:
      codepage: undefined
  ]
  value = 'abcdef'

  buffer = new WritableTrackingBuffer(0, 'ascii')
  buffer.writeUInt64LE(value.length)
  buffer.writeUInt32LE(3)
  buffer.writeString(value.slice(0, 3))
  buffer.writeUInt32LE(3)
  buffer.writeString(value.slice(3, 6))
  buffer.writeUInt32LE(0)
  #console.log(buffer.data)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].value, value)
  test.strictEqual(token.columns[0].metadata, colMetaData[0])

  test.done()

module.exports.varCharMaxWithCodepage = (test) ->
  colMetaData = [
    type: dataTypeByName.VarChar
    dataLength: 65535
    collation:
      codepage: 'WINDOWS-1252'
  ]
  value = 'abcdéf'

  buffer = new WritableTrackingBuffer(0, 'ascii')
  buffer.writeUInt64LE(value.length)
  buffer.writeUInt32LE(3)
  buffer.writeString(value.slice(0, 3))
  buffer.writeUInt32LE(3)
  buffer.writeString(value.slice(3, 6))
  buffer.writeUInt32LE(0)
  #console.log(buffer.data)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].value, value)
  test.strictEqual(token.columns[0].metadata, colMetaData[0])

  test.done()

module.exports.varCharMaxKnownLengthWrong = (test) ->
  colMetaData = [
    type: dataTypeByName.VarChar
    dataLength: 65535
  ]
  value = 'abcdef'

  buffer = new WritableTrackingBuffer(0, 'ascii')
  buffer.writeUInt64LE(value.length + 1)
  buffer.writeUInt32LE(3)
  buffer.writeString(value.slice(0, 3))
  buffer.writeUInt32LE(3)
  buffer.writeString(value.slice(3, 6))
  buffer.writeUInt32LE(0)
  #console.log(buffer.data)

  try
    token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
    test.ok(false)
  catch exception
    test.done()

module.exports.varBinaryMaxNull = (test) ->
  colMetaData = [
    type: dataTypeByName.VarBinary
    dataLength: 65535
  ]

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]))
  #console.log(buffer.data)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].value, null)
  test.strictEqual(token.columns[0].metadata, colMetaData[0])

  test.done()

module.exports.varBinaryMaxUnknownLength = (test) ->
  colMetaData = [
    type: dataTypeByName.VarBinary
    dataLength: 65535
  ]
  value = [0x12, 0x34, 0x56, 0x78]

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]))
  buffer.writeUInt32LE(2)
  buffer.writeBuffer(new Buffer(value.slice(0, 2)))
  buffer.writeUInt32LE(2)
  buffer.writeBuffer(new Buffer(value.slice(2, 4)))
  buffer.writeUInt32LE(0)
  #console.log(buffer.data)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.deepEqual(token.columns[0].value, value)
  test.strictEqual(token.columns[0].metadata, colMetaData[0])

  test.done()

module.exports.intN = (test) ->
  colMetaData = [
    {type: dataTypeByName.IntN}
    {type: dataTypeByName.IntN}
    {type: dataTypeByName.IntN}
    {type: dataTypeByName.IntN}
    {type: dataTypeByName.IntN}
    {type: dataTypeByName.IntN}
    {type: dataTypeByName.IntN}
    {type: dataTypeByName.IntN}
    {type: dataTypeByName.IntN}
    {type: dataTypeByName.IntN}
    {type: dataTypeByName.IntN}
    {type: dataTypeByName.IntN}
  ]

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([
    0,
    8, 0,0,0,0,0,0,0,0,
    8, 1,0,0,0,0,0,0,0,
    8, 255,255,255,255,255,255,255,255,
    8, 2,0,0,0,0,0,0,0,
    8, 254,255,255,255,255,255,255,255,
    8, 255,255,255,255,255,255,255,127,
    8, 0,0,0,0,0,0,0,128,
    8, 10,0,0,0,0,0,0,0,
    8, 100,0,0,0,0,0,0,0,
    8, 232,3,0,0,0,0,0,0,
    8, 16,39,0,0,0,0,0,0]))
  #console.log(buffer.data)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 12)
  test.strictEqual(token.columns[0].value, null)
  test.strictEqual("0", token.columns[1].value)
  test.strictEqual("1", token.columns[2].value)
  test.strictEqual("-1", token.columns[3].value)
  test.strictEqual("2", token.columns[4].value)
  test.strictEqual("-2", token.columns[5].value)
  test.strictEqual("9223372036854775807", token.columns[6].value)
  test.strictEqual("-9223372036854775808", token.columns[7].value)
  test.strictEqual("10", token.columns[8].value)
  test.strictEqual("100", token.columns[9].value)
  test.strictEqual("1000", token.columns[10].value)
  test.strictEqual("10000", token.columns[11].value)

  test.done()

module.exports.guidN = (test) ->
  colMetaData = [
    {type: dataTypeByName.UniqueIdentifierN}
    {type: dataTypeByName.UniqueIdentifierN}
  ]

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([
    0,
    16, 0x01,0x23,0x45,0x67,0x89,0xab,0xcd,0xef,0x01,0x23,0x45,0x67,0x89,0xab,0xcd,0xef
  ]))
  # console.log(buffer.data)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  # console.log(token)

  test.strictEqual(token.columns.length, 2)
  test.strictEqual(token.columns[0].value, null)
  test.deepEqual('67452301-AB89-EFCD-0123-456789ABCDEF', token.columns[1].value)

  test.done()

module.exports.floatN = (test) ->
  colMetaData = [
    {type: dataTypeByName.FloatN}
    {type: dataTypeByName.FloatN}
    {type: dataTypeByName.FloatN}
  ]

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([
    0,
    4, 0x00, 0x00, 0x18, 0x41,
    8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x23, 0x40
  ]))
  #console.log(buffer.data)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 3)
  test.strictEqual(token.columns[0].value, null)
  test.strictEqual(9.5, token.columns[1].value)
  test.strictEqual(9.5, token.columns[2].value)

  test.done()

module.exports.datetime = (test) ->
  colMetaData = [type: dataTypeByName.DateTime]

  days = 2                                        # 3rd January 1900
  threeHundredthsOfSecond = 45 * 300              # 45 seconds

  buffer = new WritableTrackingBuffer(0, 'ucs2')

  buffer.writeInt32LE(days)
  buffer.writeUInt32LE(threeHundredthsOfSecond)
  #console.log(buffer)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].value.getTime(), new Date('January 3, 1900 00:00:45').getTime())

  test.done()

module.exports.datetimeN = (test) ->
  colMetaData = [type: dataTypeByName.DateTimeN]

  buffer = new WritableTrackingBuffer(0, 'ucs2')

  buffer.writeUInt8(0)
  #console.log(buffer)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].value, null)

  test.done()

module.exports.numeric4Bytes = (test) ->
  colMetaData = [
    type: dataTypeByName.NumericN
    precision: 3
    scale: 1
  ]

  value = 9.3

  buffer = new WritableTrackingBuffer(0, 'ucs2')

  buffer.writeUInt8(1 + 4)
  buffer.writeUInt8(1)      # positive
  buffer.writeUInt32LE(93)
  #console.log(buffer)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].value, value)

  test.done()

module.exports.numeric4BytesNegative = (test) ->
  colMetaData = [
    type: dataTypeByName.NumericN
    precision: 3
    scale: 1
  ]

  value = -9.3

  buffer = new WritableTrackingBuffer(0, 'ucs2')

  buffer.writeUInt8(1 + 4)
  buffer.writeUInt8(0)      # negative
  buffer.writeUInt32LE(93)
  #console.log(buffer)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].value, value)

  test.done()

module.exports.numeric8Bytes = (test) ->
  colMetaData = [
    type: dataTypeByName.NumericN
    precision: 13
    scale: 1
  ]

  value = (0x100000000 + 93) / 10

  buffer = new WritableTrackingBuffer(0, 'ucs2')

  buffer.writeUInt8(1 + 8)
  buffer.writeUInt8(1)      # positive
  buffer.writeUInt32LE(93)
  buffer.writeUInt32LE(1)
  #console.log(buffer)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].value, value)

  test.done()

module.exports.numeric12Bytes = (test) ->
  colMetaData = [
    type: dataTypeByName.NumericN
    precision: 23
    scale: 1
  ]

  value = ((0x100000000 * 0x100000000) + 0x200000000 + 93) / 10

  buffer = new WritableTrackingBuffer(0, 'ucs2')

  buffer.writeUInt8(1 + 12)
  buffer.writeUInt8(1)      # positive
  buffer.writeUInt32LE(93)
  buffer.writeUInt32LE(2)
  buffer.writeUInt32LE(1)
  #console.log(buffer)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].value, value)

  test.done()

module.exports.numeric16Bytes = (test) ->
  colMetaData = [
    type: dataTypeByName.NumericN
    precision: 33
    scale: 1
  ]

  value = ((0x100000000 * 0x100000000 * 0x100000000) + (0x200000000 * 0x100000000) + 0x300000000 + 93) / 10

  buffer = new WritableTrackingBuffer(0, 'ucs2')

  buffer.writeUInt8(1 + 16)
  buffer.writeUInt8(1)      # positive
  buffer.writeUInt32LE(93)
  buffer.writeUInt32LE(3)
  buffer.writeUInt32LE(2)
  buffer.writeUInt32LE(1)
  #console.log(buffer)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].value, value)

  test.done()

module.exports.numericNull = (test) ->
  colMetaData = [
    type: dataTypeByName.NumericN
    precision: 3
    scale: 1
  ]

  buffer = new WritableTrackingBuffer(0, 'ucs2')

  buffer.writeUInt8(0)
  #console.log(buffer)

  token = parser(new ReadableTrackingBuffer(buffer.data, 'ucs2'), colMetaData)
  #console.log(token)

  test.strictEqual(token.columns.length, 1)
  test.strictEqual(token.columns[0].value, null)

  test.done()
