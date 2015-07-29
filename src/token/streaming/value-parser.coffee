iconv = require('iconv-lite')
sprintf = require('sprintf').sprintf
guidParser = require('./guid-parser')

convertLEBytesToString = require('../../tracking-buffer/bigint').convertLEBytesToString

NULL = (1 << 16) - 1
MAX = (1 << 16) - 1
THREE_AND_A_THIRD = 3 + (1 / 3)
MONEY_DIVISOR = 10000

PLP_NULL = new Buffer([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])
UNKNOWN_PLP_LEN = new Buffer([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])

DEFAULT_ENCODING = 'utf8'

parseNull = ->

module.exports = (metaData) ->
  type = metaData.type

  @tap ->
    delete @vars.dataLength
    delete @vars.value

  if type.hasTextPointerAndTimestamp
    @uint8 "textPointerLength"
    @tap ->
      if @vars.textPointerLength != 0
        @buffer "_", "textPointerLength"
        @buffer "_", 8
      else
        @vars.dataLength = 0
        @vars.textPointerNull = true

  @tap ->
    if !@vars.dataLength && @vars.dataLength != 0
      # s2.2.4.2.1
      switch type.id & 0x30
        when 0x10 # xx01xxxx - s2.2.4.2.1.1
          # Zero length
          @vars.dataLength = 0
        when 0x20 # xx10xxxx - s2.2.4.2.1.3
          # Variable length
          if metaData.dataLength != MAX
            switch type.dataLengthLength
              when 0
                @vars.dataLength = undefined
              when 1
                @uint8 "dataLength"
              when 2
                @uint16le "dataLength"
              when 4
                @uint32le "dataLength"
              else
                throw Error("Unsupported dataLengthLength #{type.dataLengthLength} for data type #{type.name}")

        when 0x30 # xx11xxxx - s2.2.4.2.1.2
          # Fixed length
          @vars.dataLength = 1 << ((type.id & 0x0C) >> 2)

  @tap ->
    switch type.name
      when 'Null'
        @vars.value = null
      when 'TinyInt'
        @uint8 "value"
      when 'SmallInt'
        @int16le "value"
      when 'Int'
        @int32le "value"
      when 'BigInt'
        @buffer "value", 8
        @tap -> @vars.value = convertLEBytesToString(@vars.value)
      when 'IntN'
        switch @vars.dataLength
          when 0
            @vars.value = null
          when 1
            @uint8 "value"
          when 2
            @int16le "value"
          when 4
            @int32le "value"
          when 8
            @buffer "value", 8
            @tap -> @vars.value = convertLEBytesToString(@vars.value)
          else
            throw new Error("Unsupported dataLength #{@vars.dataLength} for IntN")
      when 'Real'
        @floatle "value"
      when 'Float'
        @doublele "value"
      when 'FloatN'
        switch @vars.dataLength
          when 0
            @vars.value = null
          when 4
            @floatle "value"
          when 8
            @doublele "value"
          else
            throw new Error("Unsupported dataLength #{@vars.dataLength} for FloatN")
      when 'Money', 'SmallMoney', 'MoneyN'
        switch @vars.dataLength
          when 0
            @vars.value = null
          when 4
            @int32le "value"
            @tap -> @vars.value = @vars.value / MONEY_DIVISOR
          when 8
            @int32le "_value__high"
            @uint32le "_value__low"

            @tap ->
              @vars.value = @vars._value__low + (0x100000000 * @vars._value__high)
              @vars.value /= MONEY_DIVISOR
              delete @vars._value__high
              delete @vars._value__low
          else
            throw new Error("Unsupported dataLength #{@vars.dataLength} for MoneyN")
      when 'Bit'
        @uint8 "value"
        @tap -> @vars.value = !!@vars.value
      when 'BitN'
        switch @vars.dataLength
          when 0
            @vars.value = null
          when 1
            @uint8 "value"
            @tap -> @vars.value = !!@vars.value
      when 'VarChar', 'Char'
        codepage = metaData.collation.codepage
        if metaData.dataLength == MAX
          readMaxChars.call(@, codepage)
        else
          readChars.call(@, @vars.dataLength, codepage)
      when 'NVarChar', 'NChar'
        if metaData.dataLength == MAX
          readMaxNChars.call(@)
        else
          readNChars.call(@, @vars.dataLength)
      when 'VarBinary', 'Binary'
        if metaData.dataLength == MAX
          readMaxBinary.call(@)
        else
          readBinary.call(@, @vars.dataLength)
      when 'Text'
        if @vars.textPointerNull
          @vars.value = null
        else
          readChars.call(@, @vars.dataLength, metaData.collation.codepage)
      when 'NText'
        if @vars.textPointerNull
          @vars.value = null
        else
          readNChars.call(@, @vars.dataLength)
      when 'Image'
        if @vars.textPointerNull
          @vars.value = null
        else
          readBinary.call(@, @vars.dataLength)
      when 'Xml'
        readMaxNChars.call(@)
      when 'SmallDateTime'
        readSmallDateTime.call(@)
      when 'DateTime'
        readDateTime.call(@)
      when 'DateTimeN'
        switch @vars.dataLength
          when 0
            @vars.value = null
          when 4
            readSmallDateTime.call(@)
          when 8
            readDateTime.call(@)
      when 'TimeN'
        @uint8 "dataLength"
        @tap ->
          if @vars.dataLength == 0
            @vars.value = null
          else
            readTime.call @, @vars.dataLength, metaData.scale
      when 'DateN'
        @uint8 "dataLength"
        @tap ->
          if @vars.dataLength == 0
            @vars.value = null
          else
            readDate.call(@)
      when 'DateTime2N'
        @uint8 "dataLength"
        @tap ->
          if @vars.dataLength == 0
            @vars.value = null
          else
            readDateTime2.call @, @vars.dataLength, metaData.scale
      when 'DateTimeOffsetN'
        @uint8 "dataLength"
        @tap ->
          if @vars.dataLength == 0
            @vars.value = null
          else
            readDateTimeOffset.call(@, @vars.dataLength, metaData.scale)
      when 'NumericN', 'DecimalN'
        if @vars.dataLength == 0
          @vars.value = null
        else
          @uint8("sign").tap -> @vars.sign = -1 unless @vars.sign == 1

          switch @vars.dataLength - 1
            when 4
              @uint32le "value"
            when 8
              @unumeric64le "value"
            when 12
              @unumeric96le "value"
            when 16
              @unumeric128le "value"
            else
              throw new Error(sprintf('Unsupported numeric size %d', @vars.dataLength - 1))

          @tap ->
            @vars.value *= @vars.sign
            @vars.value /= Math.pow(10, metaData.scale)

      when 'UniqueIdentifierN'
        switch @vars.dataLength
          when 0
            @vars.value = null
          when 0x10
            @buffer "value", 0x10
            @tap -> @vars.value = guidParser.arrayToGuid(Array.prototype.slice.call(@vars.value, 0, @vars.value.length))
          else
            throw new Error(sprintf('Unsupported guid size %d at offset 0x%04X', @vars.dataLength - 1, buffer.position))
      when 'UDT'
        readMaxBinary.call(@)
      else
        throw new Error(sprintf('Unrecognised type %s at offset 0x%04X', type.name, buffer.position))
        break

readBinary = (dataLength) ->
  if dataLength == NULL
    @vars.value = null
  else
    @buffer "value", dataLength

readChars = (dataLength, codepage=DEFAULT_ENCODING) ->
  if dataLength == NULL
    @vars.value = null
  else
    @buffer "value", dataLength
    @tap -> @vars.value = iconv.decode(@vars.value, codepage)
    
readNChars = (dataLength) ->
  if dataLength == NULL
    @vars.value = null
  else
    @buffer "value", dataLength
    @tap -> @vars.value = @vars.value.toString('ucs2')

readMaxBinary = () ->
  readMax.call(@)

readMaxChars = (codepage=DEFAULT_ENCODING) ->
  readMax.call(@)
  @tap ->
    @vars.value = iconv.decode(@vars.value, codepage) if @vars.value

readMaxNChars = () ->
  readMax.call(@)
  @tap -> @vars.value = @vars.value.toString('ucs2') if @vars.value

readMax = (decodeFunction) ->
  @buffer "length", 8
  @tap ->
    if @vars.length.equals(PLP_NULL)
      @vars.value = null
    else
      unless @vars.length.equals(UNKNOWN_PLP_LEN)
        low = @vars.length.readUInt32LE(0)
        high = @vars.length.readUInt32LE(4)

        if (high >= (2 << (53 - 32)))
          console.warn("Read UInt64LE > 53 bits : high=#{high}, low=#{low}")

        expectedLength = low + (0x100000000 * high)

      length = 0
      chunks = []

      @loop (end) ->
        @uint32le "chunkLength"
        @tap ->
          return end(true) if @vars.chunkLength == 0
          length += @vars.chunkLength
          @buffer "chunkData", "chunkLength"
          @tap -> chunks.push @vars.chunkData

      @tap ->
        if expectedLength && length != expectedLength
          throw new Error("Partially Length-prefixed Bytes unmatched lengths : expected #{expectedLength}, but got #{length} bytes")

      @tap ->
        @vars.value = Buffer.concat(chunks, length)

readSmallDateTime = ->
  @uint16le "days"
  @uint16le "minutes"

  @tap ->
    if @options.useUTC
      value = new Date(Date.UTC(1900, 0, 1))
      value.setUTCDate(value.getUTCDate() + @vars.days)
      value.setUTCMinutes(value.getUTCMinutes() + @vars.minutes)
    else
      value = new Date(1900, 0, 1)
      value.setDate(value.getDate() + @vars.days)
      value.setMinutes(value.getMinutes() + @vars.minutes)
    
    @vars.value = value

readDateTime = ->
  @int32le "days"
  @uint32le "milliseconds"
  @tap -> @vars.milliseconds = @vars.milliseconds * THREE_AND_A_THIRD

  @tap ->
    if @options.useUTC
      value = new Date(Date.UTC(1900, 0, 1))
      value.setUTCDate(value.getUTCDate() + @vars.days)
      value.setUTCMilliseconds(value.getUTCMilliseconds() + @vars.milliseconds)
    else
      value = new Date(1900, 0, 1)
      value.setDate(value.getDate() + @vars.days)
      value.setMilliseconds(value.getMilliseconds() + @vars.milliseconds)
      
    @vars.value = value

readTime = (dataLength, scale) ->
  switch dataLength
    when 3 then @uint24le "milliseconds"
    when 4 then @uint32le "milliseconds"
    when 5 then @uint40le "milliseconds"

  if scale < 7
    @tap -> @vars.milliseconds *= 10 for i in [scale + 1..7]
  
  @tap ->
    @vars.value = new Date(Date.UTC(1970, 0, 1, 0, 0, 0, @vars.milliseconds / 10000))
    Object.defineProperty @vars.value, "nanosecondsDelta",
      enumerable: false
      value: (@vars.milliseconds % 10000) / Math.pow(10, 7)
    delete @vars.milliseconds

readDate = ->
  @uint24le "days"
  @tap ->
    @vars.value = new Date(Date.UTC(2000, 0, @vars.days - 730118))
    delete @vars.days

readDateTime2 = (dataLength, scale) ->
  readTime.call(@, dataLength - 3, scale)
  @uint24le("days")
  @tap ->
    @vars.time = @vars.value

    @vars.value = new Date(Date.UTC(2000, 0, @vars.days - 730118, 0, 0, 0, +@vars.time))
    Object.defineProperty @vars.value, "nanosecondsDelta",
      enumerable: false
      value: @vars.time.nanosecondsDelta

    delete @vars.time

readDateTimeOffset = (dataLength, scale) ->
  readTime.call(@, dataLength - 5, scale)
  @uint24le "days"
  @uint16le "offset"
  @tap ->
    @vars.time = @vars.value
    @vars.value = new Date(Date.UTC(2000, 0, @vars.days - 730118, 0, 0, 0, +@vars.time))
    Object.defineProperty @vars.value, "nanosecondsDelta",
      enumerable: false
      value: @vars.time.nanosecondsDelta
