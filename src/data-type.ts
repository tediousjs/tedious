const Null = require('./data-types/null');
const TinyInt = require('./data-types/tinyint');
const Bit = require('./data-types/bit');
const SmallInt = require('./data-types/smallint');
const Int = require('./data-types/int');
const SmallDateTime = require('./data-types/smalldatetime');
const Real = require('./data-types/real');
const Money = require('./data-types/money');
const DateTime = require('./data-types/datetime');
const Float = require('./data-types/float');
const Decimal = require('./data-types/decimal');
const Numeric = require('./data-types/numeric');
const SmallMoney = require('./data-types/smallmoney');
const BigInt = require('./data-types/bigint');
const Image = require('./data-types/image');
const Text = require('./data-types/text');
const UniqueIdentifier = require('./data-types/uniqueidentifier');
const IntN = require('./data-types/intn');
const NText = require('./data-types/ntext');
const BitN = require('./data-types/bitn');
const DecimalN = require('./data-types/decimaln');
const NumericN = require('./data-types/numericn');
const FloatN = require('./data-types/floatn');
const MoneyN = require('./data-types/moneyn');
const DateTimeN = require('./data-types/datetimen');
const VarBinary = require('./data-types/varbinary');
const VarChar = require('./data-types/varchar');
const Binary = require('./data-types/binary');
const Char = require('./data-types/char');
const NVarChar = require('./data-types/nvarchar');
const NChar = require('./data-types/nchar');
const Xml = require('./data-types/xml');
const Time = require('./data-types/time');
const Date = require('./data-types/date');
const DateTime2 = require('./data-types/datetime2');
const DateTimeOffset = require('./data-types/datetimeoffset');
const UDT = require('./data-types/udt');
const TVP = require('./data-types/tvp');
const Variant = require('./data-types/sql-variant');

export const TYPE = {
  [Null.id]: Null,
  [TinyInt.id]: TinyInt,
  [Bit.id]: Bit,
  [SmallInt.id]: SmallInt,
  [Int.id]: Int,
  [SmallDateTime.id]: SmallDateTime,
  [Real.id]: Real,
  [Money.id]: Money,
  [DateTime.id]: DateTime,
  [Float.id]: Float,
  [Decimal.id]: Decimal,
  [Numeric.id]: Numeric,
  [SmallMoney.id]: SmallMoney,
  [BigInt.id]: BigInt,
  [Image.id]: Image,
  [Text.id]: Text,
  [UniqueIdentifier.id]: UniqueIdentifier,
  [IntN.id]: IntN,
  [NText.id]: NText,
  [BitN.id]: BitN,
  [DecimalN.id]: DecimalN,
  [NumericN.id]: NumericN,
  [FloatN.id]: FloatN,
  [MoneyN.id]: MoneyN,
  [DateTimeN.id]: DateTimeN,
  [VarBinary.id]: VarBinary,
  [VarChar.id]: VarChar,
  [Binary.id]: Binary,
  [Char.id]: Char,
  [NVarChar.id]: NVarChar,
  [NChar.id]: NChar,
  [Xml.id]: Xml,
  [Time.id]: Time,
  [Date.id]: Date,
  [DateTime2.id]: DateTime2,
  [DateTimeOffset.id]: DateTimeOffset,
  [UDT.id]: UDT,
  [TVP.id]: TVP,
  [Variant.id]: Variant,
};

export const typeByName = {
  TinyInt,
  Bit,
  SmallInt,
  Int,
  SmallDateTime,
  Real,
  Money,
  DateTime,
  Float,
  Decimal,
  Numeric,
  SmallMoney,
  BigInt,
  Image,
  Text,
  UniqueIdentifier,
  NText,
  VarBinary,
  VarChar,
  Binary,
  Char,
  NVarChar,
  NChar,
  Xml,
  Time,
  Date,
  DateTime2,
  DateTimeOffset,
  UDT,
  TVP,
  Variant
};
