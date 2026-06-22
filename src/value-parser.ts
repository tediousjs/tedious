import Parser, { type ParserOptions } from './token/stream-parser';
import { type Metadata, readCollation } from './metadata-parser';
import { TYPE } from './data-type';

import iconv from 'iconv-lite';
import { sprintf } from 'sprintf-js';
import { bufferToLowerCaseGuid, bufferToUpperCaseGuid } from './guid-parser';
import { NotEnoughDataError, Result, readBigInt64LE, readDoubleLE, readFloatLE, readInt16LE, readInt32LE, readUInt16LE, readUInt32LE, readUInt8, readUInt24LE, readUInt40LE, readUNumeric64LE, readUNumeric96LE, readUNumeric128LE } from './token/helpers';
import { type Temporal } from './temporal';
import { epochDaysToPlainDate, offsetMinutesToString, scaledTicksToPlainTime, EPOCH_1900 } from './temporal-conversion';

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
          throw new Error(sprintf('Unsupported guid size %d', dataLength! - 1));
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
    throw new Error(sprintf('Unsupported numeric dataLength %d', dataLength));
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

async function readPLPStream(parser: Parser): Promise<null | Buffer[]> {
  while (parser.buffer.length < parser.position + 8) {
    await parser.waitForChunk();
  }

  const expectedLength = parser.buffer.readBigUInt64LE(parser.position);
  parser.position += 8;

  if (expectedLength === PLP_NULL) {
    return null;
  }

  const chunks: Buffer[] = [];
  let currentLength = 0;

  while (true) {
    while (parser.buffer.length < parser.position + 4) {
      await parser.waitForChunk();
    }

    const chunkLength = parser.buffer.readUInt32LE(parser.position);
    parser.position += 4;

    if (!chunkLength) {
      break;
    }

    while (parser.buffer.length < parser.position + chunkLength) {
      await parser.waitForChunk();
    }

    chunks.push(parser.buffer.slice(parser.position, parser.position + chunkLength));
    parser.position += chunkLength;
    currentLength += chunkLength;
  }

  if (expectedLength !== UNKNOWN_PLP_LEN) {
    if (currentLength !== Number(expectedLength)) {
      throw new Error('Partially Length-prefixed Bytes unmatched lengths : expected ' + expectedLength + ', but got ' + currentLength + ' bytes');
    }
  }

  return chunks;
}

// SQL Server `smalldatetime` is a zoneless wall-clock date and time, mapped to
// `Temporal.PlainDateTime`.
function readSmallDateTime(buf: Buffer, offset: number): Result<Temporal.PlainDateTime> {
  let days;
  ({ offset, value: days } = readUInt16LE(buf, offset));

  let minutes;
  ({ offset, value: minutes } = readUInt16LE(buf, offset));

  const value = epochDaysToPlainDate(days, EPOCH_1900)
    .toPlainDateTime()
    .add({ minutes });

  return new Result(value, offset);
}

// SQL Server `datetime` is a zoneless wall-clock date and time, mapped to
// `Temporal.PlainDateTime`.
function readDateTime(buf: Buffer, offset: number): Result<Temporal.PlainDateTime> {
  let days;
  ({ offset, value: days } = readInt32LE(buf, offset));

  let threeHundredthsOfSecond;
  ({ offset, value: threeHundredthsOfSecond } = readInt32LE(buf, offset));

  const milliseconds = Math.round(threeHundredthsOfSecond * THREE_AND_A_THIRD);

  const value = epochDaysToPlainDate(days, EPOCH_1900)
    .toPlainDateTime()
    .add({ milliseconds });

  return new Result(value, offset);
}

// Read the SQL Server scaled time-of-day value shared by `time`, `datetime2`
// and `datetimeoffset`, returning the wire integer (in 10^-scale-second units).
function readScaledTime(buf: Buffer, offset: number, dataLength: number): Result<number> {
  switch (dataLength) {
    case 3:
      return readUInt24LE(buf, offset);
    case 4:
      return readUInt32LE(buf, offset);
    case 5:
      return readUInt40LE(buf, offset);
    default:
      throw new Error('unreachable');
  }
}

// SQL Server `time` is a zoneless time of day, mapped to `Temporal.PlainTime`,
// whose nanosecond resolution covers all scales (0..7, i.e. down to 100ns).
function readTime(buf: Buffer, offset: number, dataLength: number, scale: number): Result<Temporal.PlainTime> {
  let ticks;
  ({ offset, value: ticks } = readScaledTime(buf, offset, dataLength));

  return new Result(scaledTicksToPlainTime(ticks, scale), offset);
}

// SQL Server `date` is a calendar date with no time or zone, mapped to
// `Temporal.PlainDate`.
function readDate(buf: Buffer, offset: number): Result<Temporal.PlainDate> {
  let days;
  ({ offset, value: days } = readUInt24LE(buf, offset));

  return new Result(epochDaysToPlainDate(days), offset);
}

// SQL Server `datetime2` is a zoneless wall-clock date and time, mapped to
// `Temporal.PlainDateTime`.
function readDateTime2(buf: Buffer, offset: number, dataLength: number, scale: number): Result<Temporal.PlainDateTime> {
  let time;
  ({ offset, value: time } = readTime(buf, offset, dataLength - 3, scale));

  let days;
  ({ offset, value: days } = readUInt24LE(buf, offset));

  return new Result(epochDaysToPlainDate(days).toPlainDateTime(time), offset);
}

// SQL Server `datetimeoffset` stores a UTC date and time plus a fixed UTC
// offset, mapped to a `Temporal.ZonedDateTime` in an offset time zone. This
// preserves the local wall-clock time, the offset, and the exact instant.
function readDateTimeOffset(buf: Buffer, offset: number, dataLength: number, scale: number): Result<Temporal.ZonedDateTime> {
  let time;
  ({ offset, value: time } = readTime(buf, offset, dataLength - 5, scale));

  let days;
  ({ offset, value: days } = readUInt24LE(buf, offset));

  let offsetMinutes;
  ({ offset, value: offsetMinutes } = readInt16LE(buf, offset));

  const instant = epochDaysToPlainDate(days)
    .toPlainDateTime(time)
    .toZonedDateTime('UTC')
    .toInstant();

  const value = instant.toZonedDateTimeISO(offsetMinutesToString(offsetMinutes));

  return new Result(value, offset);
}

module.exports.readValue = readValue;
module.exports.isPLPStream = isPLPStream;
module.exports.readPLPStream = readPLPStream;

export { readValue, isPLPStream, readPLPStream };
