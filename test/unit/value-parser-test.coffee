parser = require('../../src/value-parser')
dataTypeByName = require('../../src/data-type').typeByName
ReadableTrackingBuffer = require('../../src/tracking-buffer/tracking-buffer').ReadableTrackingBuffer
WritableTrackingBuffer = require('../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer

module.exports.null = (test) ->
  metaData =
    type: dataTypeByName.Null

  buffer = new WritableTrackingBuffer(0, 'ucs2')

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (value) ->
    test.strictEqual(value, null)
    test.done()
  )

module.exports.int = (test) ->
  metaData = type: dataTypeByName.Int
  value = 3

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeUInt32LE(value)

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (value) ->
    test.strictEqual(value, 3)
    test.done()
  )

module.exports.bigint = (test) ->
  metaData =
    type: dataTypeByName.BigInt

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([255,255,255,255,255,255,255,127]))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (value) ->
    test.strictEqual(value, "9223372036854775807")
    test.done()
  )

module.exports.real = (test) ->
  metaData =
    type: dataTypeByName.Real

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([0x00, 0x00, 0x18, 0x41]))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (value) ->
    test.strictEqual(value, 9.5)
    test.done()
  )

module.exports.float = (test) ->
  metaData =
    type: dataTypeByName.Float

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x23, 0x40]))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (value) ->
    test.strictEqual(value, 9.5)
    test.done()
  )

module.exports.smallmoney = (test) ->
  metaData =
    type: dataTypeByName.SmallMoney

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([0x80, 0xd6, 0x12, 0x00]))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (value) ->
    test.strictEqual(value, 123.456)
    test.done()
  )

module.exports.money = (test) ->
  metaData =
    type: dataTypeByName.Money

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x80, 0xd6, 0x12, 0x00]))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (value) ->
    test.strictEqual(value, 123.456)
    test.done()
  )

module.exports.moneyNNull = (test) ->
  metaData =
    type: dataTypeByName.MoneyN

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([0x00]))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (value) ->
    test.strictEqual(value, null)
    test.done()
  )

module.exports.moneyN4bytes = (test) ->
  metaData =
    type: dataTypeByName.MoneyN

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([0x04, 0x80, 0xd6, 0x12, 0x00]))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (value) ->
    test.strictEqual(value, 123.456)
    test.done()
  )

module.exports.moneyN8bytes = (test) ->
  metaData =
    type: dataTypeByName.MoneyN

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([0x08, 0xf4, 0x10, 0x22, 0x11, 0xdc, 0x6a, 0xe9, 0x7d]))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (value) ->
    test.strictEqual(value, 123456789012345.11)
    test.done()
  )

module.exports.varCharWithoutCodepage = (test) ->
  metaData =
    type: dataTypeByName.VarChar
    collation:
      codepage: undefined
  value = 'abcde'

  buffer = new WritableTrackingBuffer(0, 'ascii')
  buffer.writeUsVarchar(value)

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, value)
    test.done()
  )

module.exports.varCharWithCodepage = (test) ->
  metaData =
    type: dataTypeByName.VarChar
    collation:
      codepage: 'WINDOWS-1252'
  value = 'abcdé'

  buffer = new WritableTrackingBuffer(0, 'ascii')
  buffer.writeUsVarchar(value)

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, value)
    test.done()
  )

module.exports.nVarChar = (test) ->
  metaData = type: dataTypeByName.NVarChar
  value = 'abc'

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeUInt16LE(value.length * 2)
  buffer.writeString(value)

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, value)
    test.done()
  )

module.exports.varBinary = (test) ->
  metaData = type: dataTypeByName.VarBinary
  value = [0x12, 0x34]

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeUInt16LE(value.length)
  buffer.writeBuffer(new Buffer(value))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.deepEqual(parsedValue, value)
    test.done()
  )

module.exports.binary = (test) ->
  metaData = type: dataTypeByName.Binary
  value = [0x12, 0x34]

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeUInt16LE(value.length)
  buffer.writeBuffer(new Buffer(value))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.deepEqual(parsedValue, value)
    test.done()
  )

module.exports.varCharMaxNull = (test) ->
  metaData =
    type: dataTypeByName.VarChar
    dataLength: 65535
    collation:
      codepage: undefined

  buffer = new WritableTrackingBuffer(0, 'ascii')
  buffer.writeBuffer(new Buffer([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, null)
    test.done()
  )

module.exports.varCharMaxUnknownLength = (test) ->
  metaData =
    type: dataTypeByName.VarChar
    dataLength: 65535
    collation:
      codepage: undefined
  value = 'abcdef'

  buffer = new WritableTrackingBuffer(0, 'ascii')
  buffer.writeBuffer(new Buffer([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFE]))
  buffer.writeUInt32LE(3)
  buffer.writeString(value.slice(0, 3))
  buffer.writeUInt32LE(3)
  buffer.writeString(value.slice(3, 6))
  buffer.writeUInt32LE(0)

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, value)
    test.done()
  )

module.exports.varCharMaxKnownLength = (test) ->
  metaData =
    type: dataTypeByName.VarChar
    dataLength: 65535
    collation:
      codepage: undefined
  value = 'abcdef'

  buffer = new WritableTrackingBuffer(0, 'ascii')
  buffer.writeUInt64LE(value.length)
  buffer.writeUInt32LE(3)
  buffer.writeString(value.slice(0, 3))
  buffer.writeUInt32LE(3)
  buffer.writeString(value.slice(3, 6))
  buffer.writeUInt32LE(0)

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, value)
    test.done()
  )

module.exports.varCharMaxWithCodepage = (test) ->
  metaData =
    type: dataTypeByName.VarChar
    dataLength: 65535
    collation:
      codepage: 'WINDOWS-1252'
  value = 'abcdéf'

  buffer = new WritableTrackingBuffer(0, 'ascii')
  buffer.writeUInt64LE(value.length)
  buffer.writeUInt32LE(3)
  buffer.writeString(value.slice(0, 3))
  buffer.writeUInt32LE(3)
  buffer.writeString(value.slice(3, 6))
  buffer.writeUInt32LE(0)

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, value)
    test.done()
  )

module.exports.varCharMaxKnownLengthWrong = (test) ->
  metaData =
    type: dataTypeByName.VarChar
    dataLength: 65535
    collation:
      codepage: undefined
  value = 'abcdef'

  buffer = new WritableTrackingBuffer(0, 'ascii')
  buffer.writeUInt64LE(value.length + 1)
  buffer.writeUInt32LE(3)
  buffer.writeString(value.slice(0, 3))
  buffer.writeUInt32LE(3)
  buffer.writeString(value.slice(3, 6))
  buffer.writeUInt32LE(0)

  try
    parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
      test.ok(false)
    )
  catch exception
    test.done()

module.exports.nVarCharMax = (test) ->
  metaData =
    type: dataTypeByName.NVarChar
    dataLength: 65535
    collation:
      codepage: undefined
  value = 'abcdef'

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFE]))
  buffer.writeUInt32LE(6)
  buffer.writeString(value.slice(0, 3))
  buffer.writeUInt32LE(6)
  buffer.writeString(value.slice(3, 6))
  buffer.writeUInt32LE(0)

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, value)
    test.done()
  )

module.exports.varBinaryMaxNull = (test) ->
  metaData =
    type: dataTypeByName.VarBinary
    dataLength: 65535

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, null)
    test.done()
  )

module.exports.varBinaryMaxUnknownLength = (test) ->
  metaData =
    type: dataTypeByName.VarBinary
    dataLength: 65535
  value = [0x12, 0x34, 0x56, 0x78]

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFE]))
  buffer.writeUInt32LE(2)
  buffer.writeBuffer(new Buffer(value.slice(0, 2)))
  buffer.writeUInt32LE(2)
  buffer.writeBuffer(new Buffer(value.slice(2, 4)))
  buffer.writeUInt32LE(0)

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.deepEqual(parsedValue, value)
    test.done()
  )

module.exports.intNNull = (test) ->
  metaData =
    type: dataTypeByName.IntN

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([0]))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, null)
    test.done()
  )

module.exports.intNNull = (test) ->
  metaData =
    type: dataTypeByName.IntN

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([0]))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, null)
    test.done()
  )

module.exports.intN8bit = (test) ->
  metaData =
    type: dataTypeByName.IntN
  value = 42

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([1, value]))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, value)
    test.done()
  )

module.exports.intN16bit = (test) ->
  metaData =
    type: dataTypeByName.IntN

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([2, 42, 0]))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, 42)
    test.done()
  )

module.exports.intN32bit = (test) ->
  metaData =
    type: dataTypeByName.IntN

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([4, 42, 0, 0, 0]))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, 42)
    test.done()
  )

module.exports.intN64bit = (test) ->
  metaData =
    type: dataTypeByName.IntN
  value = 42

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([8, 255,255,255,255,255,255,255,127,]))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, '9223372036854775807')
    test.done()
  )

module.exports.guidN = (test) ->
  metaData =
    type: dataTypeByName.UniqueIdentifierN

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([
    16, 0x01,0x23,0x45,0x67,0x89,0xab,0xcd,0xef,0x01,0x23,0x45,0x67,0x89,0xab,0xcd,0xef
  ]))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.deepEqual(parsedValue, [0x01,0x23,0x45,0x67,0x89,0xab,0xcd,0xef,0x01,0x23,0x45,0x67,0x89,0xab,0xcd,0xef])
    test.done()
  )

module.exports.guidNull = (test) ->
  metaData =
    type: dataTypeByName.UniqueIdentifierN

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([0]))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, null)
    test.done()
  )

module.exports.floatNFloat = (test) ->
  metaData =
    type: dataTypeByName.FloatN

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([4, 0x00, 0x00, 0x18, 0x41]))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, 9.5)
    test.done()
  )

module.exports.floatNDouble = (test) ->
  metaData =
    type: dataTypeByName.FloatN

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x23, 0x40]))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, 9.5)
    test.done()
  )

module.exports.floatNNull = (test) ->
  metaData =
    type: dataTypeByName.FloatN

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeBuffer(new Buffer([0]))

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, null)
    test.done()
  )

module.exports.smalldatetime = (test) ->
  metaData = type: dataTypeByName.SmallDateTime

  days = 2                                        # 3rd January 1900
  minutes = (14 * 60) + 17                        # 14:17

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeInt16LE(days)
  buffer.writeUInt16LE(minutes)

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.deepEqual(parsedValue, new Date('January 3, 1900 14:17:00'))
    test.done()
  )


module.exports.datetimeNNull = (test) ->
  metaData = type: dataTypeByName.DateTimeN

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeInt8(0)

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, null)
    test.done()
  )

module.exports.datetimeNSmalldatetime = (test) ->
  metaData = type: dataTypeByName.DateTimeN

  days = 2                                        # 3rd January 1900
  minutes = (14 * 60) + 17                        # 14:17

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeInt8(4)
  buffer.writeInt16LE(days)
  buffer.writeUInt16LE(minutes)

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.deepEqual(parsedValue, new Date('January 3, 1900 14:17:00'))
    test.done()
  )

module.exports.datetimeNDatetime = (test) ->
  metaData = type: dataTypeByName.DateTimeN

  days = 2                                        # 3rd January 1900
  threeHundredthsOfSecond = 45 * 300              # 45 seconds

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeInt8(8)
  buffer.writeInt32LE(days)
  buffer.writeUInt32LE(threeHundredthsOfSecond)

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.deepEqual(parsedValue, new Date('January 3, 1900 00:00:45'))
    test.done()
  )

module.exports.numeric4Bytes = (test) ->
  metaData =
    type: dataTypeByName.NumericN
    precision: 3
    scale: 1

  value = 9.3

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeUInt8(1 + 4)
  buffer.writeUInt8(1)      # positive
  buffer.writeUInt32LE(93)

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, value)
    test.done()
  )

module.exports.numeric4BytesNegative = (test) ->
  metaData =
    type: dataTypeByName.NumericN
    precision: 3
    scale: 1

  value = -9.3

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeUInt8(1 + 4)
  buffer.writeUInt8(0)      # negative
  buffer.writeUInt32LE(93)

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, value)
    test.done()
  )

module.exports.numeric8Bytes = (test) ->
  metaData =
    type: dataTypeByName.NumericN
    precision: 13
    scale: 1

  value = (0x100000000 + 93) / 10

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeUInt8(1 + 8)
  buffer.writeUInt8(1)      # positive
  buffer.writeUInt32LE(93)
  buffer.writeUInt32LE(1)

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, value)
    test.done()
  )

module.exports.numeric12Bytes = (test) ->
  metaData =
    type: dataTypeByName.NumericN
    precision: 23
    scale: 1

  value = ((0x100000000 * 0x100000000) + 0x200000000 + 93) / 10

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeUInt8(1 + 12)
  buffer.writeUInt8(1)      # positive
  buffer.writeUInt32LE(93)
  buffer.writeUInt32LE(2)
  buffer.writeUInt32LE(1)

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, value)
    test.done()
  )

module.exports.numeric16Bytes = (test) ->
  metaData =
    type: dataTypeByName.NumericN
    precision: 33
    scale: 1

  value = ((0x100000000 * 0x100000000 * 0x100000000) + (0x200000000 * 0x100000000) + 0x300000000 + 93) / 10

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeUInt8(1 + 16)
  buffer.writeUInt8(1)      # positive
  buffer.writeUInt32LE(93)
  buffer.writeUInt32LE(3)
  buffer.writeUInt32LE(2)
  buffer.writeUInt32LE(1)

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, value)
    test.done()
  )

module.exports.numericNull = (test) ->
  metaData =
    type: dataTypeByName.NumericN
    precision: 3
    scale: 1

  buffer = new WritableTrackingBuffer(0, 'ucs2')
  buffer.writeUInt8(0)

  parser(new ReadableTrackingBuffer(buffer.data), metaData, (parsedValue) ->
    test.strictEqual(parsedValue, null)
    test.done()
  )
