async = require('async')
iconv = require('iconv-lite')
sprintf = require('sprintf').sprintf
require('./buffertools')

NULL = (1 << 16) - 1
MAX = (1 << 16) - 1
THREE_AND_A_THIRD = 3 + (1 / 3)
MONEY_DIVISOR = 10000

PLP_NULL = new Buffer([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])
UNKNOWN_PLP_LEN = new Buffer([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFE])

parse = (buffer, metaData, callback) ->
  dataLength = undefined
  type = metaData.type

  readTextPointerAndTimestamp = (callback) ->
    if type.hasTextPointerAndTimestamp
      # Appear to be dummy values, so consume and discard them.
      buffer.readUInt8((textPointerLength) ->
        if textPointerLength != 0
          buffer.readMultiple(
            textPointer: [buffer.readBuffer, [textPointerLength]]
            something: [buffer.readBuffer, [8]]
            , (values) ->
              callback()
          )
        else
          dataLength = 0
          callback()
      )
    else
      callback()

  readDataLength = (callback) ->
    if !dataLength && dataLength != 0
      # s2.2.4.2.1
      switch type.id & 0x30
        when 0x10 # xx01xxxx - s2.2.4.2.1.1
          # Zero length
          dataLength = 0
          callback()
        when 0x20 # xx10xxxx - s2.2.4.2.1.3
          # Variable length
          if metaData.dataLength != MAX
            switch type.dataLengthLength
              when 1
                readIntFunction = buffer.readUInt8
              when 2
                readIntFunction = buffer.readUInt16LE
              when 4
                readIntFunction = buffer.readUInt32LE
              else
                throw Error("Unsupported dataLengthLength #{type.dataLengthLength} for data type #{type.name}")
            readIntFunction.call(buffer, (value) ->
              dataLength = value
              callback()
            )
        when 0x30 # xx11xxxx - s2.2.4.2.1.2
          # Fixed length
          dataLength = 1 << ((type.id & 0x0C) >> 2)
          callback()
    else
      callback()

  readValue = (callback) ->
    switch type.name
      when 'Null'
        callback(null)
      when 'TinyInt'
        buffer.readUInt8(callback)
      when 'Int'
        buffer.readInt32LE(callback)
      when 'SmallInt'
        buffer.readInt16LE(callback)
      when 'BigInt'
        buffer.readAsStringInt64LE(callback)
      when 'IntN'
        switch dataLength
          when 0
            callback(null)
          when 1
            buffer.readInt8(callback)
          when 2
            buffer.readInt16LE(callback)
          when 4
            buffer.readInt32LE(callback)
          when 8
            buffer.readAsStringInt64LE(callback)
          else
            throw new Error("Unsupported dataLength #{dataLength} for IntN")
      when 'Real'
        buffer.readFloatLE(callback)
      when 'Float'
        buffer.readDoubleLE(callback)
      when 'FloatN'
        switch dataLength
          when 0
            callback(null)
          when 4
            buffer.readFloatLE()
          when 8
            buffer.readDoubleLE()
          else
            throw new Error("Unsupported dataLength #{dataLength} for FloatN")
      when 'Money', 'SmallMoney', 'MoneyN'
        switch dataLength
          when 0
            callback(null)
          when 4
            buffer.readInt32LE((value) ->
              callback(value / MONEY_DIVISOR)
            )
          when 8
            buffer.readMultiple(
              high: buffer.readInt32LE
              low: buffer.readUInt32LE
              , (values) ->
                value = values.low + (0x100000000 * values.high)
                value /= MONEY_DIVISOR
                callback(value)
            )
          else
            throw new Error("Unsupported dataLength #{dataLength} for MoneyN")
      when 'Bit'
        buffer.readUInt8((value) ->
          callback(!!value)
        )
      when 'BitN'
        switch dataLength
          when 0
            callback(null)
          when 1
            buffer.readUInt8((value) ->
              callback(!!value)
            )
      when 'VarChar', 'Char'
        codepage = metaData.collation.codepage
        if metaData.dataLength == MAX
          value = readMaxChars(buffer, codepage)
        else
          value = readChars(buffer, dataLength, codepage)
      when 'NVarChar', 'NChar'
        if metaData.dataLength == MAX
          value = readMaxNChars(buffer)
        else
          value = readNChars(buffer, dataLength)
      when 'VarBinary', 'Binary'
        if metaData.dataLength == MAX
          value = readMaxBinary(buffer)
        else
          value = readBinary(buffer, dataLength)
      when 'Text'
        if dataLength == 0
          value = null
        else
          value = readChars(buffer, dataLength, metaData.collation.codepage)
      when 'NText'
        if dataLength == 0
          value = null
        else
          value = readNChars(buffer, dataLength)
      when 'Image'
        if dataLength == 0
          value = null
        else
          value = readBinary(buffer, dataLength)
      when 'SmallDateTime'
        value = readSmallDateTime(buffer)
      when 'DateTime'
        value = readDateTime(buffer)
      when 'DateTimeN'
        switch dataLength
          when 0
            value = null
          when 4
            value = readSmallDateTime(buffer)
          when 8
            value = readDateTime(buffer)
      when 'NumericN', 'DecimalN'
        if dataLength == 0
          value = null
        else
          sign = if buffer.readUInt8() == 1 then 1 else -1

          switch dataLength - 1
            when 4
              value = buffer.readUInt32LE()
            when 8
              value = buffer.readUNumeric64LE()
            when 12
              value = buffer.readUNumeric96LE()
            when 16
              value = buffer.readUNumeric128LE()
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
            value = buffer.readArray(0x10)
          else
            throw new Error(sprintf('Unsupported guid size %d at offset 0x%04X', dataLength - 1, buffer.position))
      else
        throw new Error(sprintf('Unrecognised type %s at offset 0x%04X', type.name, buffer.position))
        break

  async.series(
    [
      readTextPointerAndTimestamp
      readDataLength
      readValue
    ],
    (value) ->
      callback(value)
  )

readBinary = (buffer, dataLength) ->
  if dataLength == NULL
    null
  else
    buffer.readArray(dataLength)

readChars = (buffer, dataLength, codepage) ->
  if dataLength == NULL
    null
  else
    iconv.decode(buffer.readBuffer(dataLength), codepage)

readNChars = (buffer, dataLength) ->
  if dataLength == NULL
    null
  else
    buffer.readString(dataLength, 'ucs2')

readMaxBinary = (buffer) ->
  readMax(buffer, (valueBuffer) ->
    Array.prototype.slice.call(valueBuffer)
  )

readMaxChars = (buffer, codepage) ->
  readMax(buffer, (valueBuffer) ->
    iconv.decode(valueBuffer, codepage)
  )

readMaxNChars = (buffer) ->
  readMax(buffer, (valueBuffer) ->
    valueBuffer.toString('ucs2')
  )

readMax = (buffer, decodeFunction) ->
  type = buffer.readBuffer(8)
  if (type.equals(PLP_NULL))
    null
  else
    if (type.equals(UNKNOWN_PLP_LEN))
      expectedLength = undefined
    else
      buffer.rollback()
      expectedLength = buffer.readUInt64LE()

    length = 0
    chunks = []

    # Read, and accumulate, chunks from buffer.
    chunkLength = buffer.readUInt32LE()
    while (chunkLength != 0)
      length += chunkLength
      chunks.push(buffer.readBuffer(chunkLength))

      chunkLength = buffer.readUInt32LE()

    if expectedLength
      if length != expectedLength
        throw new Error("Partially Length-prefixed Bytes unmatched lengths : expected #{expectedLength}, but got #{length} bytes")

    # Assemble all of the chunks in to one Buffer.
    valueBuffer = new Buffer(length)
    position = 0
    for chunk in chunks
      chunk.copy(valueBuffer, position, 0)
      position += chunk.length

    decodeFunction(valueBuffer)

readSmallDateTime = (buffer) ->
  days = buffer.readUInt16LE()
  minutes = buffer.readUInt16LE()

  value = new Date(1900, 0, 1)
  value.setDate(value.getDate() + days)
  value.setMinutes(value.getMinutes() + minutes)
  value

readDateTime = (buffer) ->
  days = buffer.readInt32LE()
  threeHundredthsOfSecond = buffer.readUInt32LE()
  milliseconds = threeHundredthsOfSecond * THREE_AND_A_THIRD

  value = new Date(1900, 0, 1)
  value.setDate(value.getDate() + days)
  value.setMilliseconds(value.getMilliseconds() + milliseconds)
  value

module.exports = parse
