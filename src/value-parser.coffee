sprintf = require('sprintf').sprintf
require('./buffertools')

NULL = (1 << 16) - 1
MAX = (1 << 16) - 1
THREE_AND_A_THIRD = 3 + (1 / 3)
MONEY_DIVISOR = 10000

PLP_NULL = new Buffer([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])
UNKNOWN_PLP_LEN = new Buffer([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFE])

parse = (buffer, metaData) ->
  value = undefined
  dataLength = undefined

  type = metaData.type

  if type.hasTextPointerAndTimestamp
    # Appear to be dummy values, so consume and discard them.
    textPointerLength = buffer.readUInt8()
    if textPointerLength != 0
      buffer.readBuffer(textPointerLength)
      buffer.readBuffer(8)
    else
      dataLength = 0

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
            when 1
              dataLength = buffer.readUInt8()
            when 2
              dataLength = buffer.readUInt16LE()
            when 4
              dataLength = buffer.readUInt32LE()
            else
              throw Error("Unsupported dataLengthLength #{type.dataLengthLength} for data type #{type.name}")
      when 0x30 # xx11xxxx - s2.2.4.2.1.2
        # Fixed length
        dataLength = 1 << ((type.id & 0x0C) >> 2)

  switch type.name
    when 'Null'
      value = null
    when 'TinyInt'
      value = buffer.readUInt8()
    when 'Int'
      value = buffer.readInt32LE()
    when 'SmallInt'
      value = buffer.readInt16LE()
    when 'BigInt'
      value = buffer.readAsStringInt64LE()
    when 'IntN'
      switch dataLength
        when 0
          value = null
        when 1
          value = buffer.readInt8()
        when 2
          value = buffer.readInt16LE()
        when 4
          value = buffer.readInt32LE()
        when 8
          value = buffer.readAsStringInt64LE()
        else
          throw new Error("Unsupported dataLength #{dataLength} for IntN")
    when 'Real'
      value = buffer.readFloatLE()
    when 'Float'
      value = buffer.readDoubleLE()
    when 'FloatN'
      switch dataLength
        when 0
          value = null
        when 4
          value = buffer.readFloatLE()
        when 8
          value = buffer.readDoubleLE()
        else
          throw new Error("Unsupported dataLength #{dataLength} for FloatN")
    when 'Money', 'SmallMoney', 'MoneyN'
      switch dataLength
        when 0
          value = null
        when 4
          value = buffer.readInt32LE() / MONEY_DIVISOR
        when 8
          high = buffer.readInt32LE()
          low = buffer.readUInt32LE()
          value = low + (0x100000000 * high)
          value /= MONEY_DIVISOR
        else
          throw new Error("Unsupported dataLength #{dataLength} for MoneyN")
    when 'Bit'
      value = !!buffer.readUInt8()
    when 'BitN'
      switch dataLength
        when 0
          value = null
        when 1
          value = !!buffer.readUInt8()
    when 'VarChar', 'Char', 'NVarChar', 'NChar'
      switch type.name
        when 'VarChar', 'Char'
          iconv = metaData.collation.iconv
          encoding = 'ascii'
        when 'NVarChar', 'NChar'
          iconv = undefined
          encoding = 'ucs2'

      if metaData.dataLength == MAX
        if iconv
          value = readMaxChars(buffer, iconv)
        else
          value = readMaxChars(buffer, encoding)
      else
        if iconv
          value = readChars(buffer, dataLength, iconv)
        else
          value = readChars(buffer, dataLength, encoding)
    when 'VarBinary', 'Binary'
      if metaData.dataLength == MAX
        value = readMaxBinary(buffer)
      else
        value = readBinary(buffer, dataLength)
    when 'Text'
      if dataLength == 0
        value = null
      else
        if metaData.collation.iconv
          value = readChars(buffer, dataLength, metaData.collation.iconv)
        else
          value = readChars(buffer, dataLength, 'ascii')
    when 'NText'
      if dataLength == 0
        value = null
      else
        value = readChars(buffer, dataLength, 'ucs2')
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

  value

readBinary = (buffer, dataLength) ->
  if dataLength == NULL
    null
  else
    buffer.readArray(dataLength)

readChars = (buffer, dataLength, encodingOrIconv) ->
  if dataLength == NULL
    null
  else
    if typeof encodingOrIconv == 'string'
      encoding = encodingOrIconv
      buffer.readString(dataLength, encoding)
    else
      iconv = encodingOrIconv
      iconv.convert(buffer.readBuffer(dataLength)).toString()

readMaxBinary = (buffer) ->
  readMax(buffer, (valueBuffer) ->
    Array.prototype.slice.call(valueBuffer)
  )

readMaxChars = (buffer, encodingOrIconv) ->
  readMax(buffer, (valueBuffer) ->
    if typeof encodingOrIconv == 'string'
      encoding = encodingOrIconv
      valueBuffer.toString(encoding)
    else
      iconv = encodingOrIconv
      iconv.convert(valueBuffer).toString()
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
