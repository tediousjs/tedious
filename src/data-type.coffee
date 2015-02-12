guidParser = require('./guid-parser')
NULL = (1 << 16) - 1
EPOCH_DATE = new Date(1900, 0, 1)
UTC_EPOCH_DATE = new Date(Date.UTC(1900, 0, 1))
YEAR_ONE = Date.UTC(2000, 0, -730118)
MAX = (1 << 16) - 1

TYPE =
  # Zero-length types
  0x1F:
    type: 'NULL'
    name: 'Null'

  # Fixed-length types
  0x30:
    type: 'INT1'
    name: 'TinyInt'
    declaration: (parameter) ->
      'tinyint'
    writeTypeInfo: (buffer) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.IntN.id)
      buffer.writeUInt8(1)
    writeParameterData: (buffer, parameter) ->
      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        buffer.writeUInt8(1)
        buffer.writeUInt8(parseInt(parameter.value))
      else
        buffer.writeUInt8(0)
    validate: (value) ->
      if not value? then return null
      value = parseInt value
      if isNaN value then return new TypeError "Invalid number."
      if value < 0 or value > 255 then return new TypeError "Value must be between 0 and 255."
      value
  0x32:
    type: 'BIT'
    name: 'Bit'
    declaration: (parameter) ->
      'bit'
    writeTypeInfo: (buffer) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.BitN.id)
      buffer.writeUInt8(1)
    writeParameterData: (buffer, parameter) ->
      # ParamLenData (TYPE_VARBYTE)
      if typeof parameter.value == 'undefined' || parameter.value == null
        buffer.writeUInt8(0)
      else
        buffer.writeUInt8(1)
        buffer.writeUInt8(if parameter.value then 1 else 0)
    validate: (value) ->
      if not value? then return null
      if value then true else false
  0x34:
    type: 'INT2'
    name: 'SmallInt'
    declaration: (parameter) ->
      'smallint'
    writeTypeInfo: (buffer) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.IntN.id)
      buffer.writeUInt8(2)
    writeParameterData: (buffer, parameter) ->
      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        buffer.writeUInt8(2)
        buffer.writeInt16LE(parseInt(parameter.value))
      else
        buffer.writeUInt8(0)
    validate: (value) ->
      if not value? then return null
      value = parseInt value
      if isNaN value then return new TypeError "Invalid number."
      if value < -32768 or value > 32767 then return new TypeError "Value must be between -32768 and 32767."
      value
  0x38:
    type: 'INT4'
    name: 'Int'
    declaration: (parameter) ->
      'int'
    writeTypeInfo: (buffer) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.IntN.id)
      buffer.writeUInt8(4)
    writeParameterData: (buffer, parameter) ->
      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        buffer.writeUInt8(4)
        buffer.writeInt32LE(parseInt(parameter.value))
      else
        buffer.writeUInt8(0)
    validate: (value) ->
      if not value? then return null
      value = parseInt value
      if isNaN value then return new TypeError "Invalid number."
      if value < -2147483648 or value > 2147483647 then return new TypeError "Value must be between -2147483648 and 2147483647."
      value
  0x3A:
    type: 'DATETIM4'
    name: 'SmallDateTime'
    declaration: (parameter) ->
      'smalldatetime'
    writeTypeInfo: (buffer) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.DateTimeN.id)
      buffer.writeUInt8(4)
    writeParameterData: (buffer, parameter, options) ->
      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        if options.useUTC
          days = Math.floor (parameter.value.getTime() - UTC_EPOCH_DATE.getTime()) / (1000 * 60 * 60 * 24)
          minutes = (parameter.value.getUTCHours() * 60) + parameter.value.getUTCMinutes()
        else
          days = Math.floor (parameter.value.getTime() - EPOCH_DATE.getTime()) / (1000 * 60 * 60 * 24)
          minutes = (parameter.value.getHours() * 60) + parameter.value.getMinutes()

        buffer.writeUInt8(4)
        buffer.writeUInt16LE(days)
        buffer.writeUInt16LE(minutes)
      else
        buffer.writeUInt8(0)
    validate: (value) ->
      if not value? then return null
      if value instanceof Date then return value
      value = Date.parse value
      if isNaN value then return new TypeError "Invalid date."
      value
  0x3B:
    type: 'FLT4'
    name: 'Real'
    declaration: (parameter) ->
      'real'
    writeTypeInfo: (buffer) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.FloatN.id)
      buffer.writeUInt8(4)
    writeParameterData: (buffer, parameter) ->
      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        buffer.writeUInt8(4)
        buffer.writeFloatLE(parseFloat(parameter.value))
      else
        buffer.writeUInt8(0)
    validate: (value) ->
      if not value? then return null
      value = parseFloat value
      if isNaN value then return new TypeError "Invalid number."
      value
  0x3C:
    type: 'MONEY'
    name: 'Money'
    declaration: (parameter) ->
      "money"
    writeTypeInfo: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8 typeByName.MoneyN.id
      buffer.writeUInt8 8
    writeParameterData: (buffer, parameter) ->
      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        buffer.writeUInt8 8
        buffer.writeMoney parameter.value * 10000
      else
        buffer.writeUInt8 0
    validate: (value) ->
      if not value? then return null
      value = parseFloat value
      if isNaN value then return new TypeError "Invalid number."
      value
  0x3D:
    type: 'DATETIME'
    name: 'DateTime'
    declaration: (parameter) ->
      'datetime'
    writeTypeInfo: (buffer) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.DateTimeN.id)
      buffer.writeUInt8(8)
    writeParameterData: (buffer, parameter, options) ->
      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        if options.useUTC
          days = Math.floor (parameter.value.getTime() - UTC_EPOCH_DATE.getTime()) / (1000 * 60 * 60 * 24)
          seconds = parameter.value.getUTCHours() * 60 * 60
          seconds += parameter.value.getUTCMinutes() * 60
          seconds += parameter.value.getUTCSeconds()
          milliseconds = (seconds * 1000) + parameter.value.getUTCMilliseconds()
        else
          days = Math.floor (parameter.value.getTime() - EPOCH_DATE.getTime()) / (1000 * 60 * 60 * 24)
          seconds = parameter.value.getHours() * 60 * 60
          seconds += parameter.value.getMinutes() * 60
          seconds += parameter.value.getSeconds()
          milliseconds = (seconds * 1000) + parameter.value.getMilliseconds()
        
        threeHundredthsOfSecond = milliseconds / (3 + (1 / 3))
        threeHundredthsOfSecond = Math.floor(threeHundredthsOfSecond)

        buffer.writeUInt8(8)
        buffer.writeInt32LE(days)
        buffer.writeUInt32LE(threeHundredthsOfSecond)
      else
        buffer.writeUInt8(0)
    validate: (value) ->
      if not value? then return null
      if value instanceof Date then return value
      value = Date.parse value
      if isNaN value then return new TypeError "Invalid date."
      value
  0x3E:
    type: 'FLT8'
    name: 'Float'
    declaration: (parameter) ->
      'float'
    writeTypeInfo: (buffer) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.FloatN.id)
      buffer.writeUInt8(8)
    writeParameterData: (buffer, parameter) ->
      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        buffer.writeUInt8(8)
        buffer.writeDoubleLE(parseFloat(parameter.value))
      else
        buffer.writeUInt8(0)
    validate: (value) ->
      if not value? then return null
      value = parseFloat value
      if isNaN value then return new TypeError "Invalid number."
      value
  0x37:
    type: 'DECIMAL'
    name: 'Decimal'
    hasPrecision: true
    hasScale: true
    declaration: (parameter) ->
      "decimal(#{@resolvePrecision(parameter)}, #{@resolveScale(parameter)})"
    resolvePrecision: (parameter) ->
      if parameter.precision?
        parameter.precision
      else if parameter.value is null
        1
      else
        18
    resolveScale: (parameter) ->
      if parameter.scale?
        parameter.scale
      else
        0
    writeTypeInfo: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8 typeByName.DecimalN.id
      
      if parameter.precision <= 9
        buffer.writeUInt8 5
      else if parameter.precision <= 19
        buffer.writeUInt8 9
      else if parameter.precision <= 28
        buffer.writeUInt8 13
      else
        buffer.writeUInt8 17
      
      buffer.writeUInt8 parameter.precision
      buffer.writeUInt8 parameter.scale
    writeParameterData: (buffer, parameter) ->
      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        sign = if parameter.value < 0 then 0 else 1
        value = Math.round Math.abs parameter.value * Math.pow(10, parameter.scale)
        
        if parameter.precision <= 9
          buffer.writeUInt8 5
          buffer.writeUInt8 sign
        # Round to preven IEEE 754 floating point errors
          buffer.writeUInt32LE value
        else if parameter.precision <= 19
          buffer.writeUInt8 9
          buffer.writeUInt8 sign
          buffer.writeUInt64LE value
        else if parameter.precision <= 28
          buffer.writeUInt8 13
          buffer.writeUInt8 sign
          buffer.writeUInt64LE value
          buffer.writeUInt32LE 0x00000000
        else
          buffer.writeUInt8 17
          buffer.writeUInt8 sign
          buffer.writeUInt64LE value
          buffer.writeUInt32LE 0x00000000
          buffer.writeUInt32LE 0x00000000
      else
        buffer.writeUInt8 0
    validate: (value) ->
      if not value? then return null
      value = parseFloat value
      if isNaN value then return new TypeError "Invalid number."
      value
  0x3F:
    type: 'NUMERIC'
    name: 'Numeric'
    hasPrecision: true
    hasScale: true
    declaration: (parameter) ->
      "numeric(#{@resolvePrecision(parameter)}, #{@resolveScale(parameter)})"
    resolvePrecision: (parameter) ->
      if parameter.precision?
        parameter.precision
      else if parameter.value is null
        1
      else
        18
    resolveScale: (parameter) ->
      if parameter.scale?
        parameter.scale
      else
        0
    writeTypeInfo: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8 typeByName.NumericN.id
      
      if parameter.precision <= 9
        buffer.writeUInt8 5
      else if parameter.precision <= 19
        buffer.writeUInt8 9
      else if parameter.precision <= 28
        buffer.writeUInt8 13
      else
        buffer.writeUInt8 17
      
      buffer.writeUInt8 parameter.precision
      buffer.writeUInt8 parameter.scale
    writeParameterData: (buffer, parameter) ->
      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        sign = if parameter.value < 0 then 0 else 1
        value = Math.round Math.abs parameter.value * Math.pow(10, parameter.scale)

        if parameter.precision <= 9
          buffer.writeUInt8 5
          buffer.writeUInt8 sign
          buffer.writeUInt32LE value
        else if parameter.precision <= 19
          buffer.writeUInt8 9
          buffer.writeUInt8 sign
          buffer.writeUInt64LE value
        else if parameter.precision <= 28
          buffer.writeUInt8 13
          buffer.writeUInt8 sign
          buffer.writeUInt64LE value
          buffer.writeUInt32LE 0x00000000
        else
          buffer.writeUInt8 17
          buffer.writeUInt8 sign
          buffer.writeUInt64LE value
          buffer.writeUInt32LE 0x00000000
          buffer.writeUInt32LE 0x00000000
      else
        buffer.writeUInt8 0
    validate: (value) ->
      if not value? then return null
      value = parseFloat value
      if isNaN value then return new TypeError "Invalid number."
      value
  0x7A:
    type: 'MONEY4'
    name: 'SmallMoney'
    declaration: (parameter) ->
      "smallmoney"
    writeTypeInfo: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8 typeByName.MoneyN.id
      buffer.writeUInt8 4
    writeParameterData: (buffer, parameter) ->
      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        buffer.writeUInt8 4
        buffer.writeInt32LE parameter.value * 10000
      else
        buffer.writeUInt8 0
    validate: (value) ->
      if not value? then return null
      value = parseFloat value
      if isNaN value then return new TypeError "Invalid number."
      if value < -214748.3648 or value > 214748.3647 then return new TypeError "Value must be between -214748.3648 and 214748.3647."
      value
  0x7F:
    type: 'INT8'
    name: 'BigInt'
    declaration: (parameter) ->
      'bigint'
    writeTypeInfo: (buffer) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.IntN.id)
      buffer.writeUInt8(8)
    writeParameterData: (buffer, parameter) ->
      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        val = if typeof parameter.value != 'number' then parameter.value else parseInt(parameter.value)
        buffer.writeUInt8(8)
        buffer.writeInt64LE(val)
      else
        buffer.writeUInt8(0)
    validate: (value) ->
      if not value? then return null
      value

  # Variable-length types
  0x22:
    type: 'IMAGE'
    name: 'Image'
    hasTableName: true
    hasTextPointerAndTimestamp: true
    dataLengthLength: 4
    declaration: (parameter) ->
      'image'
    resolveLength: (parameter) ->
      if parameter.value?
        parameter.value.length
      else
        -1
    writeTypeInfo: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8 @id
      buffer.writeInt32LE parameter.length
    writeParameterData: (buffer, parameter) ->
      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        buffer.writeInt32LE parameter.length
        buffer.writeBuffer parameter.value
        # console.log "here we are"
        # buffer.writePLPBody parameter.value
      else
        buffer.writeInt32LE parameter.length
    validate: (value) ->
      if not value? then return null
      if not Buffer.isBuffer value then return new TypeError "Invalid buffer."
      value
      
  0x23:
    type: 'TEXT'
    name: 'Text'
    hasCollation: true
    hasTableName: true
    hasTextPointerAndTimestamp: true
    dataLengthLength: 4
    declaration: (parameter) ->
      'text'
    resolveLength: (parameter) ->
      if parameter.value?
        parameter.value.length
      else
        -1
    writeTypeInfo: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.Text.id)
      buffer.writeInt32LE(parameter.length)
    writeParameterData: (buffer, parameter) ->
      # Collation
      buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00]))

      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        buffer.writeInt32LE(parameter.length)
        buffer.writeString(parameter.value.toString(), 'ascii')
      else
        buffer.writeInt32LE(parameter.length)
    validate: (value) ->
      if not value? then return null
      if typeof value isnt 'string'
        if typeof value.toString isnt 'function' then return TypeError "Invalid string."
        value = value.toString()
      value
  0x24:
    type: 'GUIDN'
    name: 'UniqueIdentifierN'
    aliases: ['UniqueIdentifier']
    dataLengthLength: 1
    declaration: (parameter) ->
      'uniqueidentifier'
    resolveLength: (parameter) ->
      16
    writeTypeInfo: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.UniqueIdentifierN.id)
      buffer.writeUInt8(0x10)
    writeParameterData: (buffer, parameter) ->
      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        buffer.writeUInt8(0x10)
        buffer.writeBuffer(new Buffer(guidParser.guidToArray(parameter.value)))
      else
        buffer.writeUInt8(0)
    validate: (value) ->
      if not value? then return null
      if typeof value isnt 'string'
        if typeof value.toString isnt 'function' then return TypeError "Invalid string."
        value = value.toString()
      value
  0x26:
    type: 'INTN'
    name: 'IntN'
    dataLengthLength: 1
  0x63:
    type: 'NTEXT'
    name: 'NText'
    hasCollation: true
    hasTableName: true
    hasTextPointerAndTimestamp: true
    dataLengthLength: 4
  0x68:
    type: 'BITN'
    name: 'BitN'
    dataLengthLength: 1
  0x6A:
    type: 'DECIMALN'
    name: 'DecimalN'
    dataLengthLength: 1
    hasPrecision: true
    hasScale: true
  0x6C:
    type: 'NUMERICN'
    name: 'NumericN'
    dataLengthLength: 1
    hasPrecision: true
    hasScale: true
  0x6D:
    type: 'FLTN'
    name: 'FloatN'
    dataLengthLength: 1
  0x6E:
    type: 'MONEYN'
    name: 'MoneyN'
    dataLengthLength: 1
  0x6F:
    type: 'DATETIMN'
    name: 'DateTimeN'
    dataLengthLength: 1
  0xA5:
    type: 'BIGVARBIN'
    name: 'VarBinary'
    dataLengthLength: 2
    maximumLength: 8000
    declaration: (parameter) ->
      if parameter.length
        length = parameter.length
      else if parameter.value?
        length = parameter.value.length || 1
      else if parameter.value is null and not parameter.output
        length = 1
      else
        length = @maximumLength

      if length <= @maximumLength
        "varbinary(#{length})"
      else
        "varbinary(max)"
    resolveLength: (parameter) ->
      if parameter.length?
        parameter.length
      else if parameter.value?
        parameter.value.length
      else
        @maximumLength
    writeTypeInfo: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8 @id
    
      if parameter.length <= @maximumLength
        buffer.writeUInt16LE @maximumLength
      else
        buffer.writeUInt16LE MAX
    writeParameterData: (buffer, parameter) ->
      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        if parameter.length <= @maximumLength
          buffer.writeUsVarbyte parameter.value
        else
          # PLP_BODY
          buffer.writePLPBody parameter.value
      else
        if parameter.length <= @maximumLength
          buffer.writeUInt16LE NULL
        else
          # PLP_NULL
          buffer.writeUInt32LE(0xFFFFFFFF)
          buffer.writeUInt32LE(0xFFFFFFFF)
    validate: (value) ->
      if not value? then return null
      if not Buffer.isBuffer value then return new TypeError "Invalid buffer."
      value
        
  0xA7:
    type: 'BIGVARCHR'
    name: 'VarChar'
    hasCollation: true
    dataLengthLength: 2
    maximumLength: 8000
    declaration: (parameter) ->
      if parameter.length
        length = parameter.length
      else if parameter.value?
        length = parameter.value.toString().length || 1
      else if parameter.value is null and not parameter.output
        length = 1
      else
        length = @maximumLength

      if length <= @maximumLength
        "varchar(#{length})"
      else
        "varchar(max)"
    resolveLength: (parameter) ->
      if parameter.length?
        parameter.length
      else if parameter.value?
        if Buffer.isBuffer parameter.value
          parameter.value.length || 1
        else
          parameter.value.toString().length || 1
      else
        @maximumLength
    writeTypeInfo: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(@.id)
      if parameter.length <= @maximumLength
        buffer.writeUInt16LE(@maximumLength)
      else
        buffer.writeUInt16LE(MAX)
      buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00]))
    writeParameterData: (buffer, parameter) ->
      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        if parameter.length <= @maximumLength
          buffer.writeUsVarbyte parameter.value, 'ascii'
        else
          # PLP_BODY
          buffer.writePLPBody parameter.value, 'ascii'
      else
        if parameter.length <= @maximumLength
          buffer.writeUInt16LE(NULL)
        else
          # PLP_NULL
          buffer.writeUInt32LE(0xFFFFFFFF)
          buffer.writeUInt32LE(0xFFFFFFFF)
    validate: (value) ->
      if not value? then return null
      if typeof value isnt 'string'
        if typeof value.toString isnt 'function' then return TypeError "Invalid string."
        value = value.toString()
      value
  0xAD:
    type: 'BIGBinary'
    name: 'Binary'
    dataLengthLength: 2
    maximumLength: 8000
    declaration: (parameter) ->
      'binary'
    resolveLength: (parameter) ->
      if parameter.value?
        parameter.value.length
      else
        @maximumLength
    writeTypeInfo: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8 @id
      buffer.writeUInt16LE parameter.length
    writeParameterData: (buffer, parameter) ->
      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        buffer.writeUInt16LE parameter.length
        buffer.writeBuffer parameter.value.slice 0, Math.min(parameter.length, @maximumLength)
      else
        buffer.writeUInt16LE NULL
    validate: (value) ->
      if not value? then return null
      if not Buffer.isBuffer value then return new TypeError "Invalid buffer."
      value
  0xAF:
    type: 'BIGCHAR'
    name: 'Char'
    hasCollation: true
    dataLengthLength: 2
    maximumLength: 8000
    declaration: (parameter) ->
      if parameter.length
        length = parameter.length
      else if parameter.value?
        length = parameter.value.toString().length || 1
      else if parameter.value is null and not parameter.output
        length = 1
      else
        length = @maximumLength

      if length < @maximumLength
        "char(#{length})"
      else
        "char(#{@maximumLength})"
    resolveLength: (parameter) ->
      if parameter.length?
        parameter.length
      else if parameter.value?
        if Buffer.isBuffer parameter.value
          parameter.value.length || 1
        else
          parameter.value.toString().length || 1
      else
        @maximumLength
    writeTypeInfo: (buffer, parameter) ->
      buffer.writeUInt8(@.id)
      buffer.writeUInt16LE parameter.length
      buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00]))
    writeParameterData: (buffer, parameter) ->
      if parameter.value?
        buffer.writeUsVarbyte parameter.value, 'ascii'
      else
        buffer.writeUInt16LE NULL
    validate: (value) ->
      if not value? then return null
      if typeof value isnt 'string'
        if typeof value.toString isnt 'function' then return TypeError "Invalid string."
        value = value.toString()
      value
  0xE7:
    type: 'NVARCHAR'
    name: 'NVarChar'
    hasCollation: true
    dataLengthLength: 2
    maximumLength: 4000
    declaration: (parameter) ->
      if parameter.length
        length = parameter.length
      else if parameter.value?
        length = parameter.value.toString().length || 1
      else if parameter.value is null and not parameter.output
        length = 1
      else
        length = @maximumLength

      if length <= @maximumLength
        "nvarchar(#{length})"
      else
        "nvarchar(max)"
    resolveLength: (parameter) ->
      if parameter.length?
        parameter.length
      else if parameter.value?
        if Buffer.isBuffer parameter.value
          (parameter.value.length / 2) || 1
        else
          parameter.value.toString().length || 1
      else
        @maximumLength
    writeTypeInfo: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(@.id)
      if parameter.length <= @maximumLength
        buffer.writeUInt16LE parameter.length * 2
      else
        buffer.writeUInt16LE(MAX)
      buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00])) # Collation
    writeParameterData: (buffer, parameter) ->
      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        if parameter.length <= @maximumLength
          buffer.writeUsVarbyte parameter.value, 'ucs2'
        else
          # PLP_BODY
          buffer.writePLPBody parameter.value, 'ucs2'
      else
        if parameter.length <= @maximumLength
          buffer.writeUInt16LE(NULL)
        else
          # PLP_NULL
          buffer.writeUInt32LE(0xFFFFFFFF)
          buffer.writeUInt32LE(0xFFFFFFFF)
    validate: (value) ->
      if not value? then return null
      if typeof value isnt 'string'
        if typeof value.toString isnt 'function' then return TypeError "Invalid string."
        value = value.toString()
      value
  0xEF:
    type: 'NCHAR'
    name: 'NChar'
    hasCollation: true
    dataLengthLength: 2
    maximumLength: 4000
    declaration: (parameter) ->
      if parameter.length
        length = parameter.length
      else if parameter.value?
        length = parameter.value.toString().length || 1
      else if parameter.value is null and not parameter.output
        length = 1
      else
        length = @maximumLength

      if length < @maximumLength
        "nchar(#{length})"
      else
        "nchar(#{@maximumLength})"
    resolveLength: (parameter) ->
      if parameter.length?
        parameter.length
      else if parameter.value?
        if Buffer.isBuffer parameter.value
          (parameter.value.length / 2) || 1
        else
          parameter.value.toString().length || 1
      else
        @maximumLength
    writeTypeInfo: (buffer, parameter) ->
      buffer.writeUInt8(@.id)
      buffer.writeUInt16LE parameter.length * 2
      buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00]))
    writeParameterData: (buffer, parameter) ->
      if parameter.value?
        buffer.writeUsVarbyte parameter.value, 'ucs2'
      else
        buffer.writeUInt16LE NULL
    validate: (value) ->
      if not value? then return null
      if typeof value isnt 'string'
        if typeof value.toString isnt 'function' then return TypeError "Invalid string."
        value = value.toString()
      value
  0xF1:
    type: 'XML'
    name: 'Xml'
    hasSchemaPresent: true
  0x29:
    type: 'TIMEN'
    name: 'TimeN'
    aliases: ['Time']
    hasScale: true
    dataLengthLength: 0
    dataLengthFromScale: (scale) ->
      switch scale
        when 0, 1, 2 then 3
        when 3, 4 then 4
        when 5, 6, 7 then 5
    declaration: (parameter) ->
      "time(#{@resolveScale(parameter)})"
    resolveScale: (parameter) ->
      if parameter.scale?
        parameter.scale
      else if parameter.value is null
        0
      else
        7
    writeTypeInfo: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8 @id
      buffer.writeUInt8 parameter.scale
    writeParameterData: (buffer, parameter) ->
      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        parameter.value.setUTCFullYear 1970
        parameter.value.setUTCMonth 0
        parameter.value.setUTCDate 1

        time = (+parameter.value / 1000 + (parameter.value.nanosecondDelta ? 0)) * Math.pow 10, parameter.scale

        # seconds since midnight
        switch parameter.scale
          when 0, 1, 2
            buffer.writeUInt8 3
            buffer.writeUInt24LE time
          when 3, 4
            buffer.writeUInt8 4
            buffer.writeUInt32LE time
          when 5, 6, 7
            buffer.writeUInt8 5
            buffer.writeUInt40LE time
      else
        buffer.writeUInt8 0
    validate: (value) ->
      if not value? then return null
      if value instanceof Date then return value
      value = Date.parse value
      if isNaN value then return new TypeError "Invalid time."
      value
  0x28:
    type: 'DATEN'
    name: 'DateN'
    aliases: ['Date']
    dataLengthLength: 0
    declaration: (parameter) ->
      "date"
    writeTypeInfo: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(@id)
    writeParameterData: (buffer, parameter) ->
      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        buffer.writeUInt8 3
        # days since 1-1-1
        buffer.writeUInt24LE Math.floor (+parameter.value - YEAR_ONE) / 86400000
      else
        buffer.writeUInt8 0
    validate: (value) ->
      if not value? then return null
      if value instanceof Date then return value
      value = Date.parse value
      if isNaN value then return new TypeError "Invalid date."
      value
  0x2A:
    type: 'DATETIME2N'
    name: 'DateTime2N'
    aliases: ['DateTime2']
    hasScale: true
    dataLengthLength: 0
    dataLengthFromScale: (scale) ->
      switch scale
        when 0, 1, 2 then 3
        when 3, 4 then 4
        when 5, 6, 7 then 5
    declaration: (parameter) ->
      "datetime2(#{@resolveScale(parameter)})"
    resolveScale: (parameter) ->
      if parameter.scale?
        parameter.scale
      else if parameter.value is null
        0
      else
        7
    writeTypeInfo: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8 @id
      buffer.writeUInt8 parameter.scale
      
    writeParameterData: (buffer, parameter) ->
      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        time = new Date(+parameter.value)
        time.setUTCFullYear 1970
        time.setUTCMonth 0
        time.setUTCDate 1
        time = (+time / 1000 + (parameter.value.nanosecondDelta ? 0)) * Math.pow 10, parameter.scale

        # seconds since midnight
        switch parameter.scale
          when 0, 1, 2
            buffer.writeUInt8 6
            buffer.writeUInt24LE time
          when 3, 4
            buffer.writeUInt8 7
            buffer.writeUInt32LE time
          when 5, 6, 7
            buffer.writeUInt8 8
            buffer.writeUInt40LE time
        # days since 1-1-1
        buffer.writeUInt24LE Math.floor (+parameter.value - YEAR_ONE) / 86400000
      else
        buffer.writeUInt8 0
    validate: (value) ->
      if not value? then return null
      if value instanceof Date then return value
      value = Date.parse value
      if isNaN value then return new TypeError "Invalid date."
      value
  0x2B:
    type: 'DATETIMEOFFSETN'
    name: 'DateTimeOffsetN'
    aliases: ['DateTimeOffset']
    hasScale: true
    dataLengthLength: 0
    dataLengthFromScale: (scale) ->
      switch scale
        when 0, 1, 2 then 3
        when 3, 4 then 4
        when 5, 6, 7 then 5
    declaration: (parameter) ->
      "datetimeoffset(#{@resolveScale(parameter)})"
    resolveScale: (parameter) ->
      if parameter.scale?
        parameter.scale
      else if parameter.value is null
        0
      else
        7
    writeTypeInfo: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8 @id
      buffer.writeUInt8 parameter.scale
      
    writeParameterData: (buffer, parameter) ->
      # ParamLenData (TYPE_VARBYTE)
      if parameter.value?
        time = new Date(+parameter.value)
        time.setUTCFullYear 1970
        time.setUTCMonth 0
        time.setUTCDate 1
        time = (+time / 1000 + (parameter.value.nanosecondDelta ? 0)) * Math.pow 10, parameter.scale
        
        offset = -parameter.value.getTimezoneOffset()
        
        # seconds since midnight
        switch parameter.scale
          when 0, 1, 2
            buffer.writeUInt8 8
            buffer.writeUInt24LE time
          when 3, 4
            buffer.writeUInt8 9
            buffer.writeUInt32LE time
          when 5, 6, 7
            buffer.writeUInt8 10
            buffer.writeUInt40LE time
        # days since 1-1-1
        buffer.writeUInt24LE Math.floor (+parameter.value - YEAR_ONE) / 86400000
        # offset
        buffer.writeInt16LE offset
      else
        buffer.writeUInt8 0
    validate: (value) ->
      if not value? then return null
      if value instanceof Date then return value
      value = Date.parse value
      if isNaN value then return new TypeError "Invalid date."
      value
  0xF0:
    type: 'UDTTYPE'
    name: 'UDT'
    hasUDTInfo: true
  0xF3:
    type: 'TVPTYPE'
    name: 'TVP'
    declaration: (parameter) ->
      "#{parameter.value.name} readonly"
    writeTypeInfo: (buffer, parameter) ->
      buffer.writeUInt8 @id

      # TVP_TYPENAME
      buffer.writeBVarchar "" # DbName (always emtpty string)
      buffer.writeBVarchar parameter.value?.schema ? "" # OwningSchema
      buffer.writeBVarchar parameter.value?.name ? "" # TypeName
      
    writeParameterData: (buffer, parameter, options) ->
      unless parameter.value?
        buffer.writeUInt16LE 0xFFFF
        buffer.writeUInt8 0x00
        buffer.writeUInt8 0x00
        return
      
      # Columns count
      buffer.writeUInt16LE parameter.value.columns.length
      
      # *TVP_COLMETADATA
      for column in parameter.value.columns
        buffer.writeUInt32LE 0x00000000 # UserType
        buffer.writeUInt16LE 0x0000
        
        column.type.writeTypeInfo buffer, column
        
        buffer.writeBVarchar "" # ColName
      
      # TVP_NULL_TOKEN
      buffer.writeUInt8 0x00
      
      # *TVP_ROW
      for row in parameter.value.rows
        buffer.writeUInt8 0x01 # TVP_ROW_TOKEN
        
        for value, index in row
          param =
            value: value
            length: parameter.value.columns[index].length
            scale: parameter.value.columns[index].scale
            precision: parameter.value.columns[index].precision
            
          parameter.value.columns[index].type.writeParameterData buffer, param, options

      # TVP_NULL_TOKEN
      buffer.writeUInt8 0x00
    validate: (value) ->
      if not value? then return null
      if typeof value isnt 'object' then return new TypeError "Invalid table."
      if not Array.isArray value.columns then return new TypeError "Invalid table."
      if not Array.isArray value.rows then return new TypeError "Invalid table."
      value

# Types not (yet) supported
###
  CHARTYPE:             0x2F  # Char (legacy support)
  VARCHARTYPE:          0x27  # VarChar (legacy support)
  BINARYTYPE:           0x2D  # Binary (legacy support)
  VARBINARYTYPE:        0x25  # VarBinary (legacy support)

  SSVARIANTTYPE:        0x62  # Sql_Variant (introduced in TDS 7.2)
###

typeByName = {}
for id, type of TYPE
  type.id = parseInt(id, 10)
  typeByName[type.name] = type
  if type.aliases? and type.aliases instanceof Array
    for alias in type.aliases
      if not typeByName[alias]
        typeByName[alias] = type


exports.TYPE = TYPE
exports.typeByName = typeByName
