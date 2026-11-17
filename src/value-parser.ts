import Parser, { type ParserOptions } from './token/stream-parser';
import { type Metadata, readCollation } from './metadata-parser';
import { TYPE } from './data-type';

import iconv from 'iconv-lite';
import { bufferToLowerCaseGuid, bufferToUpperCaseGuid } from './guid-parser';
import { NotEnoughDataError, Result, readBigInt64LE, readBigUInt64LE, readDoubleLE, readFloatLE, readInt16LE, readInt32LE, readUInt16LE, readUInt32LE, readUInt8, readUInt24LE, readUInt40LE, readUNumeric64LE, readUNumeric96LE, readUNumeric128LE } from './token/helpers';
import { dateFromEpochDays, dateTimeFromEpochDays, EPOCH_DAYS_0001_01_01, EPOCH_DAYS_1900_01_01, NANOSECONDS_PER_DAY, Temporal, timeFromNanoseconds } from './data-types/temporal';

const NULL = (1 << 16) - 1;
const MAX = (1 << 16) - 1;
const THREE_AND_A_THIRD = 3 + (1 / 3);
const MONEY_DIVISOR = 10000;
const PLP_NULL = 0xFFFFFFFFFFFFFFFFn;
const UNKNOWN_PLP_LEN = 0xFFFFFFFFFFFFFFFEn;
const DEFAULT_ENCODING = 'utf8';

function readTinyInt(buf: Buffer, offset: number): Result<number> {
  return readUInt8(buf, offset);
}

function readSmallInt(buf: Buffer, offset: number): Result<number> {
  return readInt16LE(buf, offset);
}

function readInt(buf: Buffer, offset: number): Result<number> {
  return readInt32LE(buf, offset);
}

function readBigInt(buf: Buffer, offset: number): Result<string> {
  let value;
  ({ offset, value } = readBigInt64LE(buf, offset));

  return new Result(value.toString(), offset);
}

function readReal(buf: Buffer, offset: number): Result<number> {
  return readFloatLE(buf, offset);
}

function readFloat(buf: Buffer, offset: number): Result<number> {
  return readDoubleLE(buf, offset);
}

function readSmallMoney(buf: Buffer, offset: number): Result<number> {
  let value;
  ({ offset, value } = readInt32LE(buf, offset));

  return new Result(value / MONEY_DIVISOR, offset);
}

function readMoney(buf: Buffer, offset: number): Result<number> {
  let high;
  ({ offset, value: high } = readInt32LE(buf, offset));

  let low;
  ({ offset, value: low } = readUInt32LE(buf, offset));

  return new Result((low + (0x100000000 * high)) / MONEY_DIVISOR, offset);
}

function readBit(buf: Buffer, offset: number): Result<boolean> {
  let value;
  ({ offset, value } = readUInt8(buf, offset));

  return new Result(!!value, offset);
}

function readValue(buf: Buffer, offset: number, metadata: Metadata, options: ParserOptions): Result<unknown> {
  const type = metadata.type;

  switch (type.name) {
    case 'Null':
      return new Result(null, offset);

    case 'TinyInt': {
      return readTinyInt(buf, offset);
    }

    case 'SmallInt': {
      return readSmallInt(buf, offset);
    }

    case 'Int': {
      return readInt(buf, offset);
    }

    case 'BigInt': {
      return readBigInt(buf, offset);
    }

    case 'IntN': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      switch (dataLength) {
        case 0:
          return new Result(null, offset);

        case 1:
          return readTinyInt(buf, offset);
        case 2:
          return readSmallInt(buf, offset);
        case 4:
          return readInt(buf, offset);
        case 8:
          return readBigInt(buf, offset);

        default:
          throw new Error('Unsupported dataLength ' + dataLength + ' for IntN');
      }
    }

    case 'Real': {
      return readReal(buf, offset);
    }

    case 'Float': {
      return readFloat(buf, offset);
    }

    case 'FloatN': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      switch (dataLength) {
        case 0:
          return new Result(null, offset);

        case 4:
          return readReal(buf, offset);
        case 8:
          return readFloat(buf, offset);

        default:
          throw new Error('Unsupported dataLength ' + dataLength + ' for FloatN');
      }
    }

    case 'SmallMoney': {
      return readSmallMoney(buf, offset);
    }

    case 'Money':
      return readMoney(buf, offset);

    case 'MoneyN': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      switch (dataLength) {
        case 0:
          return new Result(null, offset);

        case 4:
          return readSmallMoney(buf, offset);
        case 8:
          return readMoney(buf, offset);

        default:
          throw new Error('Unsupported dataLength ' + dataLength + ' for MoneyN');
      }
    }

    case 'Bit': {
      return readBit(buf, offset);
    }

    case 'BitN': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      switch (dataLength) {
        case 0:
          return new Result(null, offset);

        case 1:
          return readBit(buf, offset);

        default:
          throw new Error('Unsupported dataLength ' + dataLength + ' for BitN');
      }
    }

    case 'VarChar':
    case 'Char': {
      const codepage = metadata.collation!.codepage!;

      let dataLength;
      ({ offset, value: dataLength } = readUInt16LE(buf, offset));

      if (dataLength === NULL) {
        return new Result(null, offset);
      }

      return readChars(buf, offset, dataLength, codepage);
    }

    case 'NVarChar':
    case 'NChar': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt16LE(buf, offset));

      if (dataLength === NULL) {
        return new Result(null, offset);
      }

      return readNChars(buf, offset, dataLength);
    }

    case 'VarBinary':
    case 'Binary': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt16LE(buf, offset));

      if (dataLength === NULL) {
        return new Result(null, offset);
      }

      return readBinary(buf, offset, dataLength);
    }

    case 'Text': {
      let textPointerLength;
      ({ offset, value: textPointerLength } = readUInt8(buf, offset));

      if (textPointerLength === 0) {
        return new Result(null, offset);
      }

      // Textpointer
      ({ offset } = readBinary(buf, offset, textPointerLength));

      // Timestamp
      ({ offset } = readBinary(buf, offset, 8));

      let dataLength;
      ({ offset, value: dataLength } = readUInt32LE(buf, offset));

      return readChars(buf, offset, dataLength, metadata.collation!.codepage!);
    }

    case 'NText': {
      let textPointerLength;
      ({ offset, value: textPointerLength } = readUInt8(buf, offset));

      if (textPointerLength === 0) {
        return new Result(null, offset);
      }

      // Textpointer
      ({ offset } = readBinary(buf, offset, textPointerLength));

      // Timestamp
      ({ offset } = readBinary(buf, offset, 8));

      let dataLength;
      ({ offset, value: dataLength } = readUInt32LE(buf, offset));

      return readNChars(buf, offset, dataLength);
    }

    case 'Image': {
      let textPointerLength;
      ({ offset, value: textPointerLength } = readUInt8(buf, offset));

      if (textPointerLength === 0) {
        return new Result(null, offset);
      }

      // Textpointer
      ({ offset } = readBinary(buf, offset, textPointerLength));

      // Timestamp
      ({ offset } = readBinary(buf, offset, 8));

      let dataLength;
      ({ offset, value: dataLength } = readUInt32LE(buf, offset));

      return readBinary(buf, offset, dataLength);
    }

    case 'SmallDateTime': {
      return readSmallDateTime(buf, offset);
    }

    case 'DateTime': {
      return readDateTime(buf, offset);
    }

    case 'DateTimeN': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      switch (dataLength) {
        case 0:
          return new Result(null, offset);

        case 4:
          return readSmallDateTime(buf, offset);
        case 8:
          return readDateTime(buf, offset);

        default:
          throw new Error('Unsupported dataLength ' + dataLength + ' for DateTimeN');
      }
    }

    case 'Time': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      if (dataLength === 0) {
        return new Result(null, offset);
      }

      return readTime(buf, offset, dataLength, metadata.scale!);
    }

    case 'Date': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      if (dataLength === 0) {
        return new Result(null, offset);
      }

      return readDate(buf, offset);
    }

    case 'DateTime2': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      if (dataLength === 0) {
        return new Result(null, offset);
      }

      return readDateTime2(buf, offset, dataLength, metadata.scale!);
    }

    case 'DateTimeOffset': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      if (dataLength === 0) {
        return new Result(null, offset);
      }

      return readDateTimeOffset(buf, offset, dataLength, metadata.scale!);
    }

    case 'NumericN':
    case 'DecimalN': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      if (dataLength === 0) {
        return new Result(null, offset);
      }

      return readNumeric(buf, offset, dataLength, metadata.precision!, metadata.scale!);
    }

    case 'UniqueIdentifier': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      switch (dataLength) {
        case 0:
          return new Result(null, offset);

        case 0x10:
          return readUniqueIdentifier(buf, offset, options);

        default:
          throw new Error(`Unsupported guid size ${dataLength! - 1}`);
      }
    }

    case 'Variant': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt32LE(buf, offset));

      if (dataLength === 0) {
        return new Result(null, offset);
      }

      return readVariant(buf, offset, options, dataLength);
    }

    default: {
      throw new Error('Invalid type!');
    }
  }
}

function isPLPStream(metadata: Metadata) {
  switch (metadata.type.name) {
    case 'VarChar':
    case 'NVarChar':
    case 'VarBinary': {
      return metadata.dataLength === MAX;
    }

    case 'Xml': {
      return true;
    }

    case 'UDT': {
      return true;
    }
  }
}

function readUniqueIdentifier(buf: Buffer, offset: number, options: ParserOptions): Result<string> {
  let data;
  ({ value: data, offset } = readBinary(buf, offset, 0x10));

  return new Result(options.lowerCaseGuids ? bufferToLowerCaseGuid(data) : bufferToUpperCaseGuid(data), offset);
}

function readNumeric(buf: Buffer, offset: number, dataLength: number, _precision: number, scale: number): Result<number> {
  let sign;
  ({ offset, value: sign } = readUInt8(buf, offset));

  sign = sign === 1 ? 1 : -1;

  let value;
  if (dataLength === 5) {
    ({ offset, value } = readUInt32LE(buf, offset));
  } else if (dataLength === 9) {
    ({ offset, value } = readUNumeric64LE(buf, offset));
  } else if (dataLength === 13) {
    ({ offset, value } = readUNumeric96LE(buf, offset));
  } else if (dataLength === 17) {
    ({ offset, value } = readUNumeric128LE(buf, offset));
  } else {
    throw new Error(`Unsupported numeric dataLength ${dataLength}`);
  }

  return new Result((value * sign) / Math.pow(10, scale), offset);
}

function readVariant(buf: Buffer, offset: number, options: ParserOptions, dataLength: number): Result<unknown> {
  let baseType;
  ({ value: baseType, offset } = readUInt8(buf, offset));

  const type = TYPE[baseType];

  let propBytes;
  ({ value: propBytes, offset } = readUInt8(buf, offset));

  dataLength = dataLength - propBytes - 2;

  switch (type.name) {
    case 'UniqueIdentifier':
      return readUniqueIdentifier(buf, offset, options);

    case 'Bit':
      return readBit(buf, offset);

    case 'TinyInt':
      return readTinyInt(buf, offset);

    case 'SmallInt':
      return readSmallInt(buf, offset);

    case 'Int':
      return readInt(buf, offset);

    case 'BigInt':
      return readBigInt(buf, offset);

    case 'SmallDateTime':
      return readSmallDateTime(buf, offset);

    case 'DateTime':
      return readDateTime(buf, offset);

    case 'Real':
      return readReal(buf, offset);

    case 'Float':
      return readFloat(buf, offset);

    case 'SmallMoney':
      return readSmallMoney(buf, offset);

    case 'Money':
      return readMoney(buf, offset);

    case 'Date':
      return readDate(buf, offset);

    case 'Time': {
      let scale;
      ({ value: scale, offset } = readUInt8(buf, offset));

      return readTime(buf, offset, dataLength, scale);
    }

    case 'DateTime2': {
      let scale;
      ({ value: scale, offset } = readUInt8(buf, offset));

      return readDateTime2(buf, offset, dataLength, scale);
    }

    case 'DateTimeOffset': {
      let scale;
      ({ value: scale, offset } = readUInt8(buf, offset));

      return readDateTimeOffset(buf, offset, dataLength, scale);
    }

    case 'VarBinary':
    case 'Binary': {
      // maxLength (unused?)
      ({ offset } = readUInt16LE(buf, offset));

      return readBinary(buf, offset, dataLength);
    }

    case 'NumericN':
    case 'DecimalN': {
      let precision;
      ({ value: precision, offset } = readUInt8(buf, offset));

      let scale;
      ({ value: scale, offset } = readUInt8(buf, offset));

      return readNumeric(buf, offset, dataLength, precision, scale);
    }

    case 'VarChar':
    case 'Char': {
      // maxLength (unused?)
      ({ offset } = readUInt16LE(buf, offset));

      let collation;
      ({ value: collation, offset } = readCollation(buf, offset));

      return readChars(buf, offset, dataLength, collation.codepage!);
    }

    case 'NVarChar':
    case 'NChar': {
      // maxLength (unused?)
      ({ offset } = readUInt16LE(buf, offset));

      // collation (unused?)
      ({ offset } = readCollation(buf, offset));

      return readNChars(buf, offset, dataLength);
    }

    default:
      throw new Error('Invalid type!');
  }
}

function readBinary(buf: Buffer, offset: number, dataLength: number): Result<Buffer> {
  if (buf.length < offset + dataLength) {
    throw new NotEnoughDataError(offset + dataLength);
  }

  return new Result(buf.slice(offset, offset + dataLength), offset + dataLength);
}

function readChars(buf: Buffer, offset: number, dataLength: number, codepage: string): Result<string> {
  if (buf.length < offset + dataLength) {
    throw new NotEnoughDataError(offset + dataLength);
  }

  return new Result(iconv.decode(buf.slice(offset, offset + dataLength), codepage ?? DEFAULT_ENCODING), offset + dataLength);
}

function readNChars(buf: Buffer, offset: number, dataLength: number): Result<string> {
  if (buf.length < offset + dataLength) {
    throw new NotEnoughDataError(offset + dataLength);
  }

  return new Result(buf.toString('ucs2', offset, offset + dataLength), offset + dataLength);
}

/**
 * Reads a PLP (partially length-prefixed) value.
 *
 * PLP values can be arbitrarily large and span many chunks of incoming data,
 * so they are read incrementally: whatever part of the value is available is
 * consumed right away, and the reader's progress is kept across calls. If the
 * available data runs out, `NotEnoughDataError` is thrown and `read` can be
 * called again once more data has arrived.
 */
class PLPReader {
  declare metadata: Metadata;

  // The value's total length as announced by the server, or `undefined`
  // while it has not been read yet.
  declare expectedLength: bigint | undefined;

  declare chunks: Buffer[];
  declare length: number;

  // Number of bytes of the current PLP chunk that have not been read yet.
  declare chunkRemaining: number;

  constructor(metadata: Metadata) {
    this.metadata = metadata;
    this.expectedLength = undefined;
    this.chunks = [];
    this.length = 0;
    this.chunkRemaining = 0;
  }

  read(parser: Parser): unknown {
    if (this.expectedLength === undefined) {
      const { value, offset } = readBigUInt64LE(parser.buffer, parser.position);
      parser.position = offset;
      this.expectedLength = value;
    }

    if (this.expectedLength === PLP_NULL) {
      return null;
    }

    while (true) {
      if (this.chunkRemaining === 0) {
        const { value: chunkLength, offset } = readUInt32LE(parser.buffer, parser.position);
        parser.position = offset;

        if (chunkLength === 0) {
          break;
        }

        this.chunkRemaining = chunkLength;
      }

      const buf = parser.buffer;
      const start = parser.position;
      const end = Math.min(start + this.chunkRemaining, buf.length);
      if (start === end) {
        throw new NotEnoughDataError(start + 1);
      }

      this.chunks.push(buf.subarray(start, end));
      this.length += end - start;
      this.chunkRemaining -= end - start;
      parser.position = end;
    }

    if (this.expectedLength !== UNKNOWN_PLP_LEN && this.length !== Number(this.expectedLength)) {
      throw new Error('Partially Length-prefixed Bytes unmatched lengths : expected ' + this.expectedLength + ', but got ' + this.length + ' bytes');
    }

    // `Buffer.concat` always copies, so the value never keeps the (possibly
    // much larger) incoming data buffers alive.
    const data = Buffer.concat(this.chunks, this.length);

    switch (this.metadata.type.name) {
      case 'NVarChar':
      case 'Xml':
        return data.toString('ucs2');

      case 'VarChar':
        return iconv.decode(data, this.metadata.collation?.codepage ?? DEFAULT_ENCODING);

      default:
        return data;
    }
  }
}

// The date and time types are read as `Temporal` objects (from the
// `temporal-polyfill` ponyfill): `date` as `Temporal.PlainDate`, `time` as
// `Temporal.PlainTime`, `smalldatetime`, `datetime` and `datetime2` as
// `Temporal.PlainDateTime`, and `datetimeoffset` as `Temporal.ZonedDateTime`
// in a fixed-offset time zone. None of them depend on the `useUTC` option or
// the local time zone of the process.

function readSmallDateTime(buf: Buffer, offset: number): Result<Temporal.PlainDateTime> {
  let days;
  ({ offset, value: days } = readUInt16LE(buf, offset));

  let minutes;
  ({ offset, value: minutes } = readUInt16LE(buf, offset));

  return new Result(dateTimeFromEpochDays(EPOCH_DAYS_1900_01_01 + days, minutes * 60_000_000_000), offset);
}

function readDateTime(buf: Buffer, offset: number): Result<Temporal.PlainDateTime> {
  let days;
  ({ offset, value: days } = readInt32LE(buf, offset));

  let threeHundredthsOfSecond;
  ({ offset, value: threeHundredthsOfSecond } = readInt32LE(buf, offset));

  // `datetime` is precise to 1/300 of a second, which SQL Server itself
  // presents rounded to milliseconds (.000, .003 or .007), as is done here.
  const milliseconds = Math.round(threeHundredthsOfSecond * THREE_AND_A_THIRD);

  return new Result(dateTimeFromEpochDays(EPOCH_DAYS_1900_01_01 + days, milliseconds * 1_000_000), offset);
}

// Reads a `time` value, returned in units of 100 nanoseconds since midnight.
function readTimeValue(buf: Buffer, offset: number, dataLength: number, scale: number): Result<number> {
  let value;

  switch (dataLength) {
    case 3: {
      ({ value, offset } = readUInt24LE(buf, offset));
      break;
    }

    case 4: {
      ({ value, offset } = readUInt32LE(buf, offset));
      break;
    }

    case 5: {
      ({ value, offset } = readUInt40LE(buf, offset));
      break;
    }

    default: {
      throw new Error('unreachable');
    }
  }

  if (scale < 7) {
    for (let i = scale; i < 7; i++) {
      value *= 10;
    }
  }

  return new Result(value, offset);
}

function readTime(buf: Buffer, offset: number, dataLength: number, scale: number): Result<Temporal.PlainTime> {
  let value;
  ({ offset, value } = readTimeValue(buf, offset, dataLength, scale));

  return new Result(timeFromNanoseconds(value * 100), offset);
}

function readDate(buf: Buffer, offset: number): Result<Temporal.PlainDate> {
  let days;
  ({ offset, value: days } = readUInt24LE(buf, offset));

  return new Result(dateFromEpochDays(EPOCH_DAYS_0001_01_01 + days), offset);
}

function readDateTime2(buf: Buffer, offset: number, dataLength: number, scale: number): Result<Temporal.PlainDateTime> {
  let time;
  ({ offset, value: time } = readTimeValue(buf, offset, dataLength - 3, scale));

  let days;
  ({ offset, value: days } = readUInt24LE(buf, offset));

  return new Result(dateTimeFromEpochDays(EPOCH_DAYS_0001_01_01 + days, time * 100), offset);
}

function readDateTimeOffset(buf: Buffer, offset: number, dataLength: number, scale: number): Result<Temporal.ZonedDateTime> {
  let time;
  ({ offset, value: time } = readTimeValue(buf, offset, dataLength - 5, scale));

  let days;
  ({ offset, value: days } = readUInt24LE(buf, offset));

  let offsetMinutes;
  ({ offset, value: offsetMinutes } = readInt16LE(buf, offset));

  // The date and time are in UTC; the offset is that of the original value.
  const epochNanoseconds = BigInt(EPOCH_DAYS_0001_01_01 + days) * NANOSECONDS_PER_DAY_BIGINT + BigInt(time) * 100n;
  return new Result(new Temporal.ZonedDateTime(epochNanoseconds, formatOffset(offsetMinutes)), offset);
}

const NANOSECONDS_PER_DAY_BIGINT = BigInt(NANOSECONDS_PER_DAY);

// Formats an offset in minutes as a `±HH:MM` time zone identifier.
function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  return sign + String(Math.floor(absolute / 60)).padStart(2, '0') + ':' + String(absolute % 60).padStart(2, '0');
}

module.exports.readValue = readValue;
module.exports.isPLPStream = isPLPStream;
module.exports.PLPReader = PLPReader;

export { readValue, isPLPStream, PLPReader };
