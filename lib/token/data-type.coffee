TYPE =
  # Fixed-length types
  0x1F:
    type: 'NULL'
    name: 'Null'
    fixedLength: true
    dataLength: 0
  0x30:
    type: 'INT1'
    name: 'TinyInt'
    fixedLength: true
    dataLength: 1
  0x32:
    type: 'BIT'
    name: 'Bit'
    fixedLength: true
    dataLength: 1
  0x34:
    type: 'INT2'
    name: 'SmallInt'
    fixedLength: true
    dataLength: 2
  0x38:
    type: 'INT4'
    name: 'Int'
    fixedLength: true
    dataLength: 4
  0x3A:
    type: 'DATETIM4'
    name: 'SmallDateTime'
    fixedLength: true
    dataLength: 4
  0x3B:
    type: 'FLT4'
    name: 'Real'
    fixedLength: true
    dataLength: 4
  0x3C:
    type: 'MONEY'
    name: 'Money'
    fixedLength: true
    dataLength: 8
  0x3D:
    type: 'DATETIME'
    name: 'DateTime'
    fixedLength: true
    dataLength: 8
  0x3E:
    type: 'FLT8'
    name: 'Float'
    fixedLength: true
    dataLength: 8
  0x7A:
    type: 'MONEY4'
    name: 'SmallMoney'
    fixedLength: true
    dataLength: 4
  0x7F:
    type: 'INT8'
    name: 'BigInt'
    fixedLength: true
    dataLength: 8

  # Variable-length types
  0x26:
    type: 'INTN'
    name: 'IntN'
    variableLength: true
    dataLengthLength: 1
  0x68:
    type: 'BITN'
    name: 'BitN'
    variableLength: true
    dataLengthLength: 1
  0x6C:
    type: 'NUMERICNTYPE'
    name: 'NumericN'
    variableLength: true
    dataLengthLength: 1
    hasPrecision: true
    hasScale: true
  0x6A:
    type: 'DECIMALNTYPE'
    name: 'DecimalN'
    variableLength: true
    dataLengthLength: 1
    hasPrecision: true
    hasScale: true
  0x6F:
    type: 'DATETIMN'
    name: 'DateTimeN'
    variableLength: true
    dataLengthLength: 1
  0xA7:
    type: 'BIGVARCHR'
    name: 'VarChar'
    variableLength: true
    hasCollation: true
    dataLengthLength: 2
  0xAD:
    type: 'BIGBINARY'
    name: 'Binary'
    variableLength: true
    dataLengthLength: 2
  0xAF:
    type: 'BIGCHAR'
    name: 'Char'
    variableLength: true
    hasCollation: true
    dataLengthLength: 2
  0xE7:
    type: 'NVARCHAR'
    name: 'NVarChar'
    variableLength: true
    hasCollation: true
    dataLengthLength: 2
  0xEF:
    type: 'NCHAR'
    name: 'NChar'
    variableLength: true
    hasCollation: true
    dataLengthLength: 2

  ###
  # Variable-length types
  GUIDTYPE:
    id: 0x24
    variableLength: true
    name: 'UniqueIdentifier'
    dataLengthLength: 1
  GUIDTYPE:             0x24  # UniqueIdentifier
  DECIMALTYPE:          0x37  # Decimal (legacy support)
  NUMERICTYPE:          0x3F  # Numeric (legacy support)
  FLTNTYPE:             0x6D  # (see below)
  MONEYNTYPE:           0x6E  # (see below)
  DATENTYPE:            0x28  # (introduced in TDS 7.3)
  TIMENTYPE:            0x29  # (introduced in TDS 7.3)
  DATETIME2NTYPE:       0x2A  # (introduced in TDS 7.3)
  DATETIMEOFFSETNTYPE:  0x2B  # (introduced in TDS 7.3)
  CHARTYPE:             0x2F  # Char (legacy support)
  VARCHARTYPE:          0x27  # VarChar (legacy support)
  BINARYTYPE:           0x2D  # Binary (legacy support)
  VARBINARYTYPE:        0x25  # VarBinary (legacy support)

  BIGVARBINTYPE:        0xA5  # VarBinary
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
