iconv = require('iconv-lite')
sprintf = require('sprintf').sprintf
guidParser = require('./guid-parser')

convertLEBytesToString = require('./tracking-buffer/bigint').convertLEBytesToString

NULL = (1 << 16) - 1
MAX = (1 << 16) - 1
THREE_AND_A_THIRD = 3 + (1 / 3)
MONEY_DIVISOR = 10000

PLP_NULL = new Buffer([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])
UNKNOWN_PLP_LEN = new Buffer([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])

DEFAULT_ENCODING = 'utf8'

module.exports = (parser, metaData, options) ->
  value = undefined
  dataLength = undefined
  textPointerNull = undefined

  type = metaData.type

  if type.hasTextPointerAndTimestamp
    # Appear to be dummy values, so consume and discard them.
    textPointerLength = (yield parser.readUInt8())
    if textPointerLength != 0
      yield parser.readBuffer(textPointerLength)
      yield parser.readBuffer(8)
    else
      dataLength = 0
      textPointerNull = true

  if !dataLength && dataLength != 0
    # s2.2.4.2.1
    switch type.id & 0x30
      when 0x10 # xx01xxxx - s2.2.4.2.1.1
        # Zero length
        dataLength = 0
      when 0x20 # xx10xxxx - s2.2.4.2.1.3
        # Variable length
        if metaData.dataLength != MAX
          switch type.dataLengthLength
            when 0
              dataLength = undefined
            when 1
              dataLength = yield parser.readUInt8()
            when 2
              dataLength = yield parser.readUInt16LE()
            when 4
              dataLength = yield parser.readUInt32LE()
            else
              throw Error("Unsupported dataLengthLength #{type.dataLengthLength} for data type #{type.name}")
      when 0x30 # xx11xxxx - s2.2.4.2.1.2
        # Fixed length
        dataLength = 1 << ((type.id & 0x0C) >> 2)

  switch type.name
    when 'Null'
      value = null
    when 'TinyInt'
      value = yield parser.readUInt8()
    when 'Int'
      value = yield parser.readInt32LE()
    when 'SmallInt'
      value = yield parser.readInt16LE()
    when 'BigInt'
      value = convertLEBytesToString(yield parser.readBuffer(8))
    when 'IntN'
      switch dataLength
        when 0
          value = null
        when 1
          value = yield parser.readUInt8()
        when 2
          value = yield parser.readInt16LE()
        when 4
          value = yield parser.readInt32LE()
        when 8
          value = convertLEBytesToString(yield parser.readBuffer(8))
        else
          throw new Error("Unsupported dataLength #{dataLength} for IntN")
    when 'Real'
      value = yield parser.readFloatLE()
    when 'Float'
      value = yield parser.readDoubleLE()
    when 'FloatN'
      switch dataLength
        when 0
          value = null
        when 4
          value = yield parser.readFloatLE()
        when 8
          value = yield parser.readDoubleLE()
        else
          throw new Error("Unsupported dataLength #{dataLength} for FloatN")
    when 'Money', 'SmallMoney', 'MoneyN'
      switch dataLength
        when 0
          value = null
        when 4
          value = (yield parser.readInt32LE()) / MONEY_DIVISOR
        when 8
          high = yield parser.readInt32LE()
          low = yield parser.readUInt32LE()
          value = low + (0x100000000 * high)
          value /= MONEY_DIVISOR
        else
          throw new Error("Unsupported dataLength #{dataLength} for MoneyN")
    when 'Bit'
      value = !!(yield parser.readUInt8())
    when 'BitN'
      switch dataLength
        when 0
          value = null
        when 1
          value = !!(yield parser.readUInt8())
    when 'VarChar', 'Char'
      codepage = metaData.collation.codepage
      if metaData.dataLength == MAX
        value = yield from readMaxChars(parser, codepage)
      else
        value = yield from readChars(parser, dataLength, codepage)
    when 'NVarChar', 'NChar'
      if metaData.dataLength == MAX
        value = yield from readMaxNChars(parser)
      else
        value = yield from readNChars(parser, dataLength)
    when 'VarBinary', 'Binary'
      if metaData.dataLength == MAX
        value = yield from readMaxBinary(parser)
      else
        value = yield from readBinary(parser, dataLength)
    when 'Text'
      if textPointerNull
        value = null
      else
        value = yield from readChars(parser, dataLength, metaData.collation.codepage)
    when 'NText'
      if textPointerNull
        value = null
      else
        value = yield from readNChars(parser, dataLength)
    when 'Image'
      if textPointerNull
        value = null
      else
        value = yield from readBinary(parser, dataLength)
    when 'Xml'
      value = yield from readMaxNChars(parser)
    when 'SmallDateTime'
      value = yield from readSmallDateTime(parser, options.useUTC)
    when 'DateTime'
      value = yield from readDateTime(parser, options.useUTC)
    when 'DateTimeN'
      switch dataLength
        when 0
          value = null
        when 4
          value = yield from readSmallDateTime(parser, options.useUTC)
        when 8
          value = yield from readDateTime(parser, options.useUTC)
    when 'TimeN'
      if (dataLength = yield parser.readUInt8()) == 0
        value = null
      else
        value = yield from readTime(parser, dataLength, metaData.scale, options.useUTC)
    when 'DateN'
      if (dataLength = yield parser.readUInt8()) == 0
        value = null
      else
        value = yield from readDate(parser, options.useUTC)
    when 'DateTime2N'
      if (dataLength = yield parser.readUInt8()) == 0
        value = null
      else
        value = yield from readDateTime2(parser, dataLength, metaData.scale, options.useUTC)
    when 'DateTimeOffsetN'
      if (dataLength = yield parser.readUInt8()) == 0
        value = null
      else
        value = yield from readDateTimeOffset(parser, dataLength, metaData.scale)
    when 'NumericN', 'DecimalN'
      if dataLength == 0
        value = null
      else
        sign = if (yield parser.readUInt8()) == 1 then 1 else -1

        switch dataLength - 1
          when 4
            value = yield parser.readUInt32LE()
          when 8
            value = yield from parser.readUNumeric64LE()
          when 12
            value = yield from parser.readUNumeric96LE()
          when 16
            value = yield from parser.readUNumeric128LE()
          else
            throw new Error(sprintf('Unsupported numeric size %d at offset 0x%04X', dataLength - 1, buffer.position))
            break

        value *= sign
        value /= Math.pow(10, metaData.scale)
    when 'UniqueIdentifierN'
      switch dataLength
        when 0
          value = null
        when 0x10
          data = new Buffer(yield parser.readBuffer(0x10))
          value = guidParser.arrayToGuid(data)
        else
          throw new Error(sprintf('Unsupported guid size %d at offset 0x%04X', dataLength - 1, buffer.position))
    when 'UDT'
      value = yield from readMaxBinary(parser)
    else
      throw new Error(sprintf('Unrecognised type %s at offset 0x%04X', type.name, buffer.position))
      break

  value

readBinary = (parser, dataLength) ->
  if dataLength == NULL
    null
  else
    yield parser.readBuffer(dataLength)

readChars = (parser, dataLength, codepage=DEFAULT_ENCODING) ->
  if dataLength == NULL
    null
  else
    iconv.decode(yield parser.readBuffer(dataLength), codepage)

readNChars = (parser, dataLength) ->
  if dataLength == NULL
    null
  else
    (yield parser.readBuffer(dataLength)).toString("ucs2")

readMaxBinary = (parser) ->
  yield from readMax(parser)

readMaxChars = (parser, codepage=DEFAULT_ENCODING) ->
  if data = yield from readMax(parser)
    iconv.decode(data, codepage)
  else
    null

readMaxNChars = (parser) ->
  (yield from readMax(parser)).toString('ucs2')

readMax = (parser) ->
  type = yield parser.readBuffer(8)
  if type.equals(PLP_NULL)
    null
  else if type.equals(UNKNOWN_PLP_LEN)
    yield from readMaxUnknownLength(parser)
  else
    low = type.readUInt32LE(0)
    high = type.readUInt32LE(4)

    if (high >= (2 << (53 - 32)))
      console.warn("Read UInt64LE > 53 bits : high=#{high}, low=#{low}")

    expectedLength = low + (0x100000000 * high)
    yield from readMaxKnownLength(parser, expectedLength)

readMaxKnownLength = (parser, totalLength) ->
  data = new Buffer(totalLength)

  offset = 0
  while (chunkLength = yield parser.readUInt32LE())
    (yield parser.readBuffer(chunkLength)).copy(data, offset)
    offset += chunkLength

  if offset != totalLength
    throw new Error("Partially Length-prefixed Bytes unmatched lengths : expected #{totalLength}, but got #{offset} bytes")

  data

readMaxUnknownLength = (parser) ->
  length = 0
  chunks = []

  while (chunkLength = yield parser.readUInt32LE())
    length += chunkLength
    chunks.push(yield parser.readBuffer(chunkLength))

  # Assemble all of the chunks in to one Buffer.
  Buffer.concat(chunks, length)

readSmallDateTime = (parser, useUTC) ->
  days = yield parser.readUInt16LE()
  minutes = yield parser.readUInt16LE()

  if useUTC
    value = new Date(Date.UTC(1900, 0, 1))
    value.setUTCDate(value.getUTCDate() + days)
    value.setUTCMinutes(value.getUTCMinutes() + minutes)
  else
    value = new Date(1900, 0, 1)
    value.setDate(value.getDate() + days)
    value.setMinutes(value.getMinutes() + minutes)

  value

readDateTime = (parser, useUTC) ->
  days = yield parser.readInt32LE()
  threeHundredthsOfSecond = yield parser.readUInt32LE()
  milliseconds = threeHundredthsOfSecond * THREE_AND_A_THIRD

  if useUTC
    value = new Date(Date.UTC(1900, 0, 1))
    value.setUTCDate(value.getUTCDate() + days)
    value.setUTCMilliseconds(value.getUTCMilliseconds() + milliseconds)
  else
    value = new Date(1900, 0, 1)
    value.setDate(value.getDate() + days)
    value.setMilliseconds(value.getMilliseconds() + milliseconds)

  value

readTime = (parser, dataLength, scale, useUTC) ->
  switch dataLength
    when 3 then value = yield from parser.readUInt24LE()
    when 4 then value = yield parser.readUInt32LE()
    when 5 then value = yield from parser.readUInt40LE()

  if scale < 7
	  value *= 10 for i in [scale+1..7]

  if useUTC
    date = new Date(Date.UTC(1970, 0, 1, 0, 0, 0, value / 10000))
  else
    date = new Date(1970, 0, 1, 0, 0, 0, value / 10000)

  Object.defineProperty date, "nanosecondsDelta",
    enumerable: false
    value: (value % 10000) / Math.pow(10, 7)

  date

readDate = (parser, useUTC) ->
  days = yield from parser.readUInt24LE()

  if useUTC
    new Date(Date.UTC(2000, 0, days - 730118))
  else
    new Date(2000, 0, days - 730118)

readDateTime2 = (parser, dataLength, scale, useUTC) ->
  time = yield from readTime(parser, dataLength - 3, scale, useUTC)
  days = yield from parser.readUInt24LE()

  if useUTC
    date = new Date(Date.UTC(2000, 0, days - 730118, 0, 0, 0, +time))
  else
    date = new Date(2000, 0, days - 730118, time.getHours(), time.getMinutes(), time.getSeconds(), time.getMilliseconds())

  Object.defineProperty date, "nanosecondsDelta",
    enumerable: false
    value: time.nanosecondsDelta

  date

readDateTimeOffset = (parser, dataLength, scale) ->
  time = yield from readTime(parser, dataLength - 5, scale, true)
  days = yield from parser.readUInt24LE()
  offset = yield parser.readInt16LE()

  date = new Date(Date.UTC(2000, 0, days - 730118, 0, 0, 0, +time))
  Object.defineProperty date, "nanosecondsDelta",
    enumerable: false
    value: time.nanosecondsDelta

  date
