guidParser = require('./guid-parser')
NULL = (1 << 16) - 1
EPOCH_DATE = new Date(1900, 0, 1)
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
    writeParameterData: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.IntN.id)
      buffer.writeUInt8(1)

      # ParamLenData
      if parameter.value?
        buffer.writeUInt8(1)
        buffer.writeUInt8(parseInt(parameter.value))
      else
        buffer.writeUInt8(0)
  0x32:
    type: 'BIT'
    name: 'Bit'
    declaration: (parameter) ->
      'bit'
    writeParameterData: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.BitN.id)
      buffer.writeUInt8(1)

      # ParamLenData
      if typeof parameter.value == 'undefined' || parameter.value == null
        buffer.writeUInt8(0)
      else
        buffer.writeUInt8(1)
        buffer.writeUInt8(if parameter.value then 1 else 0)
  0x34:
    type: 'INT2'
    name: 'SmallInt'
    declaration: (parameter) ->
      'smallint'
    writeParameterData: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.IntN.id)
      buffer.writeUInt8(2)

      # ParamLenData
      if parameter.value?
        buffer.writeUInt8(2)
        buffer.writeInt16LE(parseInt(parameter.value))
      else
        buffer.writeUInt8(0)
  0x38:
    type: 'INT4'
    name: 'Int'
    declaration: (parameter) ->
      'int'
    writeParameterData: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.IntN.id)
      buffer.writeUInt8(4)

      # ParamLenData
      if parameter.value?
        buffer.writeUInt8(4)
        buffer.writeInt32LE(parseInt(parameter.value))
      else
        buffer.writeUInt8(0)
  0x3A:
    type: 'DATETIM4'
    name: 'SmallDateTime'
    declaration: (parameter) ->
      'smalldatetime'
    writeParameterData: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.DateTimeN.id)
      buffer.writeUInt8(4)

      # ParamLenData
      if parameter.value?
        days = (parameter.value.getTime() - EPOCH_DATE.getTime()) / (1000 * 60 * 60 * 24)
        days = Math.floor(days)
        minutes = (parameter.value.getHours() * 60) + parameter.value.getMinutes()

        buffer.writeUInt8(4)
        buffer.writeUInt16LE(days)
        buffer.writeUInt16LE(minutes)
      else
        buffer.writeUInt8(0)
  0x3B:
    type: 'FLT4'
    name: 'Real'
    declaration: (parameter) ->
      'real'
    writeParameterData: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.FloatN.id)
      buffer.writeUInt8(4)

      # ParamLenData
      if parameter.value?
        buffer.writeUInt8(4)
        buffer.writeFloatLE(parseFloat(parameter.value))
      else
        buffer.writeUInt8(0)
  0x3C:
    type: 'MONEY'
    name: 'Money'
  0x3D:
    type: 'DATETIME'
    name: 'DateTime'
    declaration: (parameter) ->
      'datetime'
    writeParameterData: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.DateTimeN.id)
      buffer.writeUInt8(8)

      # ParamLenData
      if parameter.value?
        days = (parameter.value.getTime() - EPOCH_DATE.getTime()) / (1000 * 60 * 60 * 24)
        days = Math.floor(days)

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
  0x3E:
    type: 'FLT8'
    name: 'Float'
    declaration: (parameter) ->
      'float'
    writeParameterData: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.FloatN.id)
      buffer.writeUInt8(8)

      # ParamLenData
      if parameter.value?
        buffer.writeUInt8(8)
        buffer.writeDoubleLE(parseFloat(parameter.value))
      else
        buffer.writeUInt8(0)
  0x7A:
    type: 'MONEY4'
    name: 'SmallMoney'
  0x7F:
    type: 'INT8'
    name: 'BigInt'
    declaration: (parameter) ->
      'bigint'
    writeParameterData: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.IntN.id)
      buffer.writeUInt8(8)

      # ParamLenData
      if parameter.value?
        buffer.writeUInt8(8)
        if parseInt(parameter.value) > 0x100000000 # 4294967296
          buffer.writeUInt32LE(parseInt(parameter.value) % 0x100000000)
        else
          buffer.writeInt32LE(parseInt(parameter.value) % 0x100000000)
        buffer.writeInt32LE(Math.floor(parseInt(parameter.value) / 0x100000000))
      else
        buffer.writeUInt8(0)

  # Variable-length types
  0x22:
    type: 'IMAGE'
    name: 'Image'
    hasTableName: true
    hasTextPointerAndTimestamp: true
    dataLengthLength: 4
    declaration: (parameter) ->
      'image'
      
    writeParameterData: (buffer, parameter) ->
      if parameter.length
        length = parameter.length
      else if parameter.value?
        length = parameter.value.length
      else
        length = -1

      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8 @id
      buffer.writeInt32LE length

      if parameter.value?
        buffer.writeInt32LE length
        buffer.writeBuffer parameter.value
      else
        buffer.writeInt32LE length
      
  0x23:
    type: 'TEXT'
    name: 'Text'
    hasCollation: true
    hasTableName: true
    hasTextPointerAndTimestamp: true
    dataLengthLength: 4
    declaration: (parameter) ->
      'text'
    writeParameterData: (buffer, parameter) ->
      if parameter.length
        length = parameter.length
      else if parameter.value?
        length = parameter.value.toString().length
      else
        length = -1

      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.Text.id)
      buffer.writeInt32LE(length)

      # Collation
      buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00]))

      # ParamLenData
      if parameter.value?
        buffer.writeInt32LE(length)
        buffer.writeString(parameter.value.toString(), 'ascii')
      else
        buffer.writeInt32LE(length)
  0x24:
    type: 'GUIDN'
    name: 'UniqueIdentifierN'
    dataLengthLength: 1
    declaration: (parameter) ->
      'uniqueidentifier'
    writeParameterData: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.UniqueIdentifierN.id)
      buffer.writeUInt8(0x10)

      # ParamLenData
      if parameter.value?
        buffer.writeUInt8(0x10)
        buffer.writeBuffer(new Buffer(guidParser.guidToArray(parameter.value)))
      else
        buffer.writeUInt8(0)
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
      else if parameter.value is null
        length = 1
      else
        length = @maximumLength

      if length <= @maximumLength
        "varbinary(#{length})"
      else
        "varbinary(max)"
        
    writeParameterData: (buffer, parameter) ->
      if parameter.length
        length = parameter.length
      else if parameter.value?
        length = parameter.value.length
      else
        length = @maximumLength

      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8 @id
    
      if length <= @maximumLength
        buffer.writeUInt16LE @maximumLength
      else
        buffer.writeUInt16LE MAX

      if parameter.value?
        if length <= @maximumLength
          buffer.writeUInt16LE length
          buffer.writeBuffer parameter.value
        else
          # Length of all chunks.
          buffer.writeUInt64LE length
          # One chunk.
          buffer.writeUInt32LE length
          buffer.writeBuffer parameter.value
          # PLP_TERMINATOR (no more chunks).
          buffer.writeUInt32LE 0
      else
        buffer.writeUInt16LE NULL
        
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
      else if parameter.value is null
        length = 1
      else
        length = @.maximumLength

      if length <= @maximumLength
        "varchar(#{length})"
      else
        "varchar(max)"
    writeParameterData: (buffer, parameter) ->
      if parameter.length
        length = parameter.length
      else if parameter.value?
        length = parameter.value.toString().length
      else
        length = @.maximumLength

      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(@.id)
      if length <= @maximumLength
        buffer.writeUInt16LE(@maximumLength)
      else
        buffer.writeUInt16LE(MAX)
      buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00]))

      # ParamLenData
      if parameter.value?
        if length <= @maximumLength
          buffer.writeUInt16LE(length)
          buffer.writeString(parameter.value.toString(), 'ascii')
        else
          # Length of all chunks.
          buffer.writeUInt64LE(length)
          # One chunk.
          buffer.writeUInt32LE(length)
          buffer.writeString(parameter.value.toString(), 'ascii')
          # PLP_TERMINATOR (no more chunks).
          buffer.writeUInt32LE(0)
      else
        buffer.writeUInt16LE(NULL)
  0xAD:
    type: 'BIGBinary'
    name: 'Binary'
    dataLengthLength: 2
    maximumLength: 8000
    declaration: (parameter) ->
      'binary'
      
    writeParameterData: (buffer, parameter) ->
      if parameter.length
        length = parameter.length
      else if parameter.value?
        length = parameter.value.length
      else
        length = @maximumLength

      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8 @id
      buffer.writeUInt16LE length
    
      if parameter.value?
        buffer.writeUInt16LE length
        buffer.writeBuffer parameter.value.slice 0, Math.min(length, @maximumLength)
      else
        buffer.writeUInt16LE NULL
      
  0xAF:
    type: 'BIGCHAR'
    name: 'Char'
    hasCollation: true
    dataLengthLength: 2
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
      else if parameter.value is null
        length = 1
      else
        length = @maximumLength

      if length <= @maximumLength
        "nvarchar(#{length})"
      else
        "nvarchar(max)"
    writeParameterData: (buffer, parameter) ->
      if parameter.length
        length = 2 * parameter.length
      else if parameter.value?
        length = 2 * parameter.value.toString().length
      else
        length = @maximumLength

      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(@.id)
      if length <= @maximumLength
        buffer.writeUInt16LE(@maximumLength)
      else
        buffer.writeUInt16LE(MAX)
      buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00])) # Collation

      # ParamLenData
      if parameter.value?
        if length <= @maximumLength
          buffer.writeUInt16LE(length)
          buffer.writeString(parameter.value.toString(), 'ucs2')
        else
          # Length of all chunks.
          buffer.writeUInt64LE(length)
          # One chunk.
          buffer.writeUInt32LE(length)
          buffer.writeString(parameter.value.toString(), 'ucs2')
          # PLP_TERMINATOR (no more chunks).
          buffer.writeUInt32LE(0)
      else
        buffer.writeUInt16LE(NULL)
  0xEF:
    type: 'NCHAR'
    name: 'NChar'
    hasCollation: true
    dataLengthLength: 2
  0xF1:
    type: 'XML'
    name: 'Xml'
    hasSchemaPresent: true
  0x29:
    type: 'TIMEN'
    name: 'TimeN'
    hasScale: true
    dataLengthLength: 0
    dataLengthFromScale: (scale) ->
      switch scale
        when 0, 1, 2 then 3
        when 3, 4 then 4
        when 5, 6, 7 then 5
        else throw new Error "Unsupported scale '#{scale}'"
    declaration: (parameter) ->
      if parameter.length
        length = parameter.length
      else if parameter.value is null
        length = 0
      else
        length = 7

      "time(#{length})"
    writeParameterData: (buffer, parameter) ->
      if parameter.length
        length = parameter.length
      else if parameter.value is null
        length = 0
      else
        length = 7

      buffer.writeUInt8 @id
      buffer.writeUInt8 length # precision

      if parameter.value?
        parameter.value.setUTCFullYear 1970
        parameter.value.setUTCMonth 0
        parameter.value.setUTCDate 1

        time = (+parameter.value / 1000 + (parameter.value.nanosecondDelta ? 0)) * Math.pow 10, length

        # seconds since midnight
        switch length
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
        
  0x28:
    type: 'DATEN'
    name: 'DateN'
    dataLengthLength: 0
    declaration: (parameter) ->
      "date"
    writeParameterData: (buffer, parameter) ->
      buffer.writeUInt8(@id)

      if parameter.value?
        buffer.writeUInt8 3
        # days since 1-1-1
        buffer.writeUInt24LE Math.floor (+parameter.value - YEAR_ONE) / 86400000
      else
        buffer.writeUInt8 0
  0x2A:
    type: 'DATETIME2N'
    name: 'DateTime2N'
    hasScale: true
    dataLengthLength: 0
    dataLengthFromScale: (scale) ->
      switch scale
        when 0, 1, 2 then 3
        when 3, 4 then 4
        when 5, 6, 7 then 5
        else throw new Error "Unsupported scale '#{scale}'"
    declaration: (parameter) ->
      if parameter.length
        length = parameter.length
      else if parameter.value is null
        length = 0
      else
        length = 7

      "datetime2(#{length})"
    writeParameterData: (buffer, parameter) ->
      if parameter.length
        length = parameter.length
      else if parameter.value is null
        length = 0
      else
        length = 7

      buffer.writeUInt8 @id
      buffer.writeUInt8 length # precision

      if parameter.value?
        time = new Date(+parameter.value)
        time.setUTCFullYear 1970
        time.setUTCMonth 0
        time.setUTCDate 1
        time = (+time / 1000 + (parameter.value.nanosecondDelta ? 0)) * Math.pow 10, length

        # seconds since midnight
        switch length
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
  0x2B:
    type: 'DATETIMEOFFSETN'
    name: 'DateTimeOffsetN'
    hasScale: true
    dataLengthLength: 0
    dataLengthFromScale: (scale) ->
      switch scale
        when 0, 1, 2 then 3
        when 3, 4 then 4
        when 5, 6, 7 then 5
        else throw new Error "Unsupported scale '#{scale}'"
    declaration: (parameter) ->
      if parameter.length
        length = parameter.length
      else if parameter.value is null
        length = 0
      else
        length = 7

      "datetimeoffset(#{length})"
    writeParameterData: (buffer, parameter) ->
      if parameter.length
        length = parameter.length
      else if parameter.value is null
        length = 0
      else
        length = 7

      buffer.writeUInt8 @id
      buffer.writeUInt8 length # precision

      if parameter.value?
        time = new Date(+parameter.value)
        time.setUTCFullYear 1970
        time.setUTCMonth 0
        time.setUTCDate 1
        time = (+time / 1000 + (parameter.value.nanosecondDelta ? 0)) * Math.pow 10, length
        
        offset = -parameter.value.getTimezoneOffset()
        
        # seconds since midnight
        switch length
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
  0xF0:
    type: 'UDTTYPE'
    name: 'UDT'
    hasUDTInfo: true

# Types not (yet) supported
###
  DECIMALTYPE:          0x37  # Decimal (legacy support)
  NUMERICTYPE:          0x3F  # Numeric (legacy support)
  CHARTYPE:             0x2F  # Char (legacy support)
  VARCHARTYPE:          0x27  # VarChar (legacy support)
  BINARYTYPE:           0x2D  # Binary (legacy support)
  VARBINARYTYPE:        0x25  # VarBinary (legacy support)

  UDTTYPE:              0xF0  # CLR-UDT (introduced in TDS 7.2)

  SSVARIANTTYPE:        0x62  # Sql_Variant (introduced in TDS 7.2)
###

typeByName = {}
for id, type of TYPE
  type.id = parseInt(id, 10)
  typeByName[type.name] = type


exports.TYPE = TYPE
exports.typeByName = typeByName
