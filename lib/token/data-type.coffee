TYPE =
  # Zero-length types
  0x1F:
    type: 'NULL'
    name: 'Null'

  # Fixed-length types
  0x30:
    type: 'INT1'
    name: 'TinyInt'
  0x32:
    type: 'BIT'
    name: 'Bit'
  0x34:
    type: 'INT2'
    name: 'SmallInt'
  0x38:
    type: 'INT4'
    name: 'Int'
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
  0x24:
    type: 'GUIDN'
    name: 'UniqueIdentifierN'
    dataLengthLength: 1
  0x26:
    type: 'INTN'
    name: 'IntN'
    dataLengthLength: 1
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
  0xEF:
    type: 'NCHAR'
    name: 'NChar'
    hasCollation: true
    dataLengthLength: 2

  ###
  # Variable-length types
  GUIDTYPE:             0x24  # UniqueIdentifier
  DECIMALTYPE:          0x37  # Decimal (legacy support)
  NUMERICTYPE:          0x3F  # Numeric (legacy support)
  MONEYNTYPE:           0x6E  # (see below)
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
  
  TEXTTYPE:             0x23  # Text
  IMAGETYPE:            0x22  # Image
  NTEXTTYPE:            0x63  # NText
  SSVARIANTTYPE:        0x62  # Sql_Variant (introduced in TDS 7.2)
###

typeByName = {}
for id, type of TYPE
  type.id = parseInt(id, 10)
  typeByName[type.name] = type


exports.TYPE = TYPE
exports.typeByName = typeByName
