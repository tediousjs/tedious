NULL = (1 << 16) - 1

TYPE =
  # Zero-length types
  0x1F:
    type: 'NULL'
    name: 'Null'

  # Fixed-length types
  0x30:
    type: 'INT1'
    name: 'TinyInt'
    declaration: () ->
      'tinyint'
    writeParameterData: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.IntN.id)
      buffer.writeUInt8(1)

      # ParamLenData
      if parameter.value
        buffer.writeUInt8(1)
        buffer.writeInt8(parameter.value)
      else
        buffer.writeUInt8(0)
  0x32:
    type: 'BIT'
    name: 'Bit'
  0x34:
    type: 'INT2'
    name: 'SmallInt'
    declaration: () ->
      'smallint'
    writeParameterData: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.IntN.id)
      buffer.writeUInt8(2)

      # ParamLenData
      if parameter.value
        buffer.writeUInt8(2)
        buffer.writeInt16LE(parameter.value)
      else
        buffer.writeUInt8(0)
  0x38:
    type: 'INT4'
    name: 'Int'
    declaration: () ->
      'int'
    writeParameterData: (buffer, parameter) ->
      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(typeByName.IntN.id)
      buffer.writeUInt8(4)

      # ParamLenData
      if parameter.value
        buffer.writeUInt8(4)
        buffer.writeInt32LE(parameter.value)
      else
        buffer.writeUInt8(0)
  0x3A:
    type: 'DATETIM4'
    name: 'SmallDateTime'
  0x3B:
    type: 'FLT4'
    name: 'Real'
  0x3C:
    type: 'MONEY'
    name: 'Money'
  0x3D:
    type: 'DATETIME'
    name: 'DateTime'
  0x3E:
    type: 'FLT8'
    name: 'Float'
  0x7A:
    type: 'MONEY4'
    name: 'SmallMoney'
  0x7F:
    type: 'INT8'
    name: 'BigInt'

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
  0x24:
    type: 'GUIDN'
    name: 'UniqueIdentifierN'
    dataLengthLength: 1
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
    declaration: () ->
      "varchar(#{@.maximumLength})"
    writeParameterData: (buffer, parameter) ->
      if parameter.length
        length = parameter.length
      else if parameter.value
        length = parameter.value.length
      else length = @.maximumLength

      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(@.id)
      buffer.writeUInt16LE(length)
      buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00]))

      # ParamLenData
      if parameter.value
        buffer.writeUInt16LE(length)
        buffer.writeString(parameter.value, 'ascii')
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
    declaration: () ->
      "nvarchar(#{@.maximumLength})"
    writeParameterData: (buffer, parameter) ->
      if parameter.length
        length = 2 * parameter.length
      else if parameter.value
        length = 2 * parameter.value.length
      else length = @maximumLength

      # ParamMetaData (TYPE_INFO)
      buffer.writeUInt8(@.id)
      buffer.writeUInt16LE(length)
      buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00]))

      # ParamLenData
      if parameter.value
        buffer.writeUInt16LE(length)
        buffer.writeString(parameter.value, 'ucs2')
      else
        buffer.writeUInt16LE(NULL)
  0xEF:
    type: 'NCHAR'
    name: 'NChar'
    hasCollation: true
    dataLengthLength: 2

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

  XMLTYPE:              0xF1  # XML (introduced in TDS 7.2)
  UDTTYPE:              0xF0  # CLR-UDT (introduced in TDS 7.2)
  
  SSVARIANTTYPE:        0x62  # Sql_Variant (introduced in TDS 7.2)
###

typeByName = {}
for id, type of TYPE
  type.id = parseInt(id, 10)
  typeByName[type.name] = type


exports.TYPE = TYPE
exports.typeByName = typeByName
