import Null from './data-types/null';
import TinyInt from './data-types/tinyint';
import Bit from './data-types/bit';
import SmallInt from './data-types/smallint';
import Int from './data-types/int';
import SmallDateTime from './data-types/smalldatetime';
import Real from './data-types/real';
import Money from './data-types/money';
import DateTime from './data-types/datetime';
import Float from './data-types/float';
import Decimal from './data-types/decimal';
import Numeric from './data-types/numeric';
import SmallMoney from './data-types/smallmoney';
import BigInt from './data-types/bigint';
import Image from './data-types/image';
import Text from './data-types/text';
import UniqueIdentifier from './data-types/uniqueidentifier';
import IntN from './data-types/intn';
import NText from './data-types/ntext';
import BitN from './data-types/bitn';
import DecimalN from './data-types/decimaln';
import NumericN from './data-types/numericn';
import FloatN from './data-types/floatn';
import MoneyN from './data-types/moneyn';
import DateTimeN from './data-types/datetimen';
import VarBinary from './data-types/varbinary';
import VarChar from './data-types/varchar';
import Binary from './data-types/binary';
import Char from './data-types/char';
import NVarChar from './data-types/nvarchar';
import NChar from './data-types/nchar';
import Xml from './data-types/xml';
import Time from './data-types/time';
import Date from './data-types/date';
import DateTime2 from './data-types/datetime2';
import DateTimeOffset from './data-types/datetimeoffset';
import UDT from './data-types/udt';
import TVP from './data-types/tvp';
import Variant from './data-types/sql-variant';

import { InternalConnectionOptions } from './connection';

export interface Parameter {
  type: DataType;
  name: string;

  value: unknown;

  output: boolean;
  length?: number;
  precision?: number;
  scale?: number;

  nullable?: boolean;
}

export interface ParameterData<T = any> {
  length?: number;
  scale?: number;
  precision?: number;

  value: T;
}

export interface DataType {
  id: number;
  type: string;
  name: string;

  declaration(parameter: Parameter): string;
  generateTypeInfo(parameter: ParameterData, options: InternalConnectionOptions): Buffer;
  generateParameterData(parameter: ParameterData, options: InternalConnectionOptions): Generator<Buffer, void>;
  validate(value: any): any; // TODO: Refactor 'any' and replace with more specific type.

  hasTableName?: boolean;

  resolveLength?: (parameter: Parameter) => number;
  resolvePrecision?: (parameter: Parameter) => number;
  resolveScale?: (parameter: Parameter) => number;
}

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
