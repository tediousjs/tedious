guidParser = require('./guid-parser')
NULL = (1 << 16) - 1
EPOCH_DATE = new Date(1900, 0, 1)
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
        buffer.writeInt8(parseInt(parameter.value))
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
        buffer.writeUInt32LE(days)
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
      if parameter.value
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
        length = parameter.value.toString().length
      else
        length = @.maximumLength

      if length <= @maximumLength
        "varchar(#{@.maximumLength})"
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
        length = 2 * parameter.length
      else if parameter.value?
        length = 2 * parameter.value.toString().length
      else
        length = @maximumLength

      if length <= @maximumLength
        "nvarchar(#{@.maximumLength})"
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

# Types not (yet) supported
###
  DECIMALTYPE:          0x37  # Decimal (legacy support)
  NUMERICTYPE:          0x3F  # Numeric (legacy support)
  DATENTYPE:            0x28  # (introduced in TDS 7.3)
  TIMENTYPE:            0x29  # (introduced in TDS 7.3)
  DATETIME2NTYPE:       0x2A  # (introduced in TDS 7.3)
  DATETIMEOFFSETNTYPE:  0x2B  # (introduced in TDS 7.3)
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
