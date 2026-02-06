import Parser, { type ParserOptions } from './token/stream-parser';
import { type Metadata, readCollation } from './metadata-parser';
import { TYPE } from './data-type';

import iconv from 'iconv-lite';
import { sprintf } from 'sprintf-js';
import { bufferToLowerCaseGuid, bufferToUpperCaseGuid } from './guid-parser';
import { NotEnoughDataError, Result, readBigInt64LE, readDoubleLE, readFloatLE, readInt16LE, readInt32LE, readUInt16LE, readUInt32LE, readUInt8, readUInt24LE, readUInt40LE, readUNumeric64LE, readUNumeric96LE, readUNumeric128LE } from './token/helpers';

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
      return readSmallDateTime(buf, offset, options.useUTC);
    }

    case 'DateTime': {
      return readDateTime(buf, offset, options.useUTC);
    }

    case 'DateTimeN': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      switch (dataLength) {
        case 0:
          return new Result(null, offset);

        case 4:
          return readSmallDateTime(buf, offset, options.useUTC);
        case 8:
          return readDateTime(buf, offset, options.useUTC);

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

      return readTime(buf, offset, dataLength, metadata.scale!, options.useUTC);
    }

    case 'Date': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      if (dataLength === 0) {
        return new Result(null, offset);
      }

      return readDate(buf, offset, options.useUTC);
    }

    case 'DateTime2': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      if (dataLength === 0) {
        return new Result(null, offset);
      }

      return readDateTime2(buf, offset, dataLength, metadata.scale!, options.useUTC);
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
      return readSmallDateTime(buf, offset, options.useUTC);

    case 'DateTime':
      return readDateTime(buf, offset, options.useUTC);

    case 'Real':
      return readReal(buf, offset);

    case 'Float':
      return readFloat(buf, offset);

    case 'SmallMoney':
      return readSmallMoney(buf, offset);

    case 'Money':
      return readMoney(buf, offset);

    case 'Date':
      return readDate(buf, offset, options.useUTC);

    case 'Time': {
      let scale;
      ({ value: scale, offset } = readUInt8(buf, offset));

      return readTime(buf, offset, dataLength, scale, options.useUTC);
    }

    case 'DateTime2': {
      let scale;
      ({ value: scale, offset } = readUInt8(buf, offset));

      return readDateTime2(buf, offset, dataLength, scale, options.useUTC);
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

function readSmallDateTime(buf: Buffer, offset: number, useUTC: boolean): Result<Date> {
  let days;
  ({ offset, value: days } = readUInt16LE(buf, offset));

  let minutes;
  ({ offset, value: minutes } = readUInt16LE(buf, offset));

  let value;
  if (useUTC) {
    value = new Date(Date.UTC(1900, 0, 1 + days, 0, minutes));
  } else {
    value = new Date(1900, 0, 1 + days, 0, minutes);
  }

  return new Result(value, offset);
}

function readDateTime(buf: Buffer, offset: number, useUTC: boolean): Result<Date> {
  let days;
  ({ offset, value: days } = readInt32LE(buf, offset));

  let threeHundredthsOfSecond;
  ({ offset, value: threeHundredthsOfSecond } = readInt32LE(buf, offset));

  const milliseconds = Math.round(threeHundredthsOfSecond * THREE_AND_A_THIRD);

  let value;
  if (useUTC) {
    value = new Date(Date.UTC(1900, 0, 1 + days, 0, 0, 0, milliseconds));
  } else {
    value = new Date(1900, 0, 1 + days, 0, 0, 0, milliseconds);
  }

  return new Result(value, offset);
}

interface DateWithNanosecondsDelta extends Date {
  nanosecondsDelta: number;
}

function readTime(buf: Buffer, offset: number, dataLength: number, scale: number, useUTC: boolean): Result<DateWithNanosecondsDelta> {
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

  let date;
  if (useUTC) {
    date = new Date(Date.UTC(1970, 0, 1, 0, 0, 0, value / 10000)) as DateWithNanosecondsDelta;
  } else {
    date = new Date(1970, 0, 1, 0, 0, 0, value / 10000) as DateWithNanosecondsDelta;
  }
  Object.defineProperty(date, 'nanosecondsDelta', {
    enumerable: false,
    value: (value % 10000) / Math.pow(10, 7)
  });

  return new Result(date, offset);
}

function readDate(buf: Buffer, offset: number, useUTC: boolean): Result<Date> {
  let days;
  ({ offset, value: days } = readUInt24LE(buf, offset));

  if (useUTC) {
    return new Result(new Date(Date.UTC(2000, 0, days - 730118)), offset);
  } else {
    return new Result(new Date(2000, 0, days - 730118), offset);
  }
}

function readDateTime2(buf: Buffer, offset: number, dataLength: number, scale: number, useUTC: boolean): Result<DateWithNanosecondsDelta> {
  let time;
  ({ offset, value: time } = readTime(buf, offset, dataLength - 3, scale, useUTC));

  let days;
  ({ offset, value: days } = readUInt24LE(buf, offset));

  let date;
  if (useUTC) {
    date = new Date(Date.UTC(2000, 0, days - 730118, 0, 0, 0, +time)) as DateWithNanosecondsDelta;
  } else {
    date = new Date(2000, 0, days - 730118, time.getHours(), time.getMinutes(), time.getSeconds(), time.getMilliseconds()) as DateWithNanosecondsDelta;
  }
  Object.defineProperty(date, 'nanosecondsDelta', {
    enumerable: false,
    value: time.nanosecondsDelta
  });

  return new Result(date, offset);
}

function readDateTimeOffset(buf: Buffer, offset: number, dataLength: number, scale: number): Result<DateWithNanosecondsDelta> {
  let time;
  ({ offset, value: time } = readTime(buf, offset, dataLength - 5, scale, true));

  let days;
  ({ offset, value: days } = readUInt24LE(buf, offset));

  // time offset?
  ({ offset } = readUInt16LE(buf, offset));

  const date = new Date(Date.UTC(2000, 0, days - 730118, 0, 0, 0, +time)) as DateWithNanosecondsDelta;
  Object.defineProperty(date, 'nanosecondsDelta', {
    enumerable: false,
    value: time.nanosecondsDelta
  });
  return new Result(date, offset);
}

module.exports.readValue = readValue;
module.exports.isPLPStream = isPLPStream;
module.exports.readPLPStream = readPLPStream;

export { readValue, isPLPStream, readPLPStream };
