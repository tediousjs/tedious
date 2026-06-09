import Parser, { type ParserOptions } from './token/stream-parser';
import { type Metadata, readCollation } from './metadata-parser';
import { TYPE } from './data-type';

import iconv from 'iconv-lite';
import { sprintf } from 'sprintf-js';
import { bufferToLowerCaseGuid, bufferToUpperCaseGuid } from './guid-parser';
import { NotEnoughDataError, Result } from './token/helpers';

const NULL = (1 << 16) - 1;
const MAX = (1 << 16) - 1;
const THREE_AND_A_THIRD = 3 + (1 / 3);
const MONEY_DIVISOR = 10000;
const PLP_NULL = 0xFFFFFFFFFFFFFFFFn;
const UNKNOWN_PLP_LEN = 0xFFFFFFFFFFFFFFFEn;
const DEFAULT_ENCODING = 'utf8';

function checkDataLength(buf: Buffer, offset: number, byteLength: number) {
  if (buf.length < offset + byteLength) {
    throw new NotEnoughDataError(offset + byteLength);
  }
}

function readTinyInt(buf: Buffer, offset: number): Result<number> {
  checkDataLength(buf, offset, 1);
  return new Result(buf.readUInt8(offset), offset + 1);
}

function readSmallInt(buf: Buffer, offset: number): Result<number> {
  checkDataLength(buf, offset, 2);
  return new Result(buf.readInt16LE(offset), offset + 2);
}

function readInt(buf: Buffer, offset: number): Result<number> {
  checkDataLength(buf, offset, 4);
  return new Result(buf.readInt32LE(offset), offset + 4);
}

function readBigInt(buf: Buffer, offset: number): Result<string> {
  checkDataLength(buf, offset, 8);
  return new Result(buf.readBigInt64LE(offset).toString(), offset + 8);
}

function readReal(buf: Buffer, offset: number): Result<number> {
  checkDataLength(buf, offset, 4);
  return new Result(buf.readFloatLE(offset), offset + 4);
}

function readFloat(buf: Buffer, offset: number): Result<number> {
  checkDataLength(buf, offset, 8);
  return new Result(buf.readDoubleLE(offset), offset + 8);
}

function readSmallMoney(buf: Buffer, offset: number): Result<number> {
  checkDataLength(buf, offset, 4);
  return new Result(buf.readInt32LE(offset) / MONEY_DIVISOR, offset + 4);
}

function readMoney(buf: Buffer, offset: number): Result<number> {
  checkDataLength(buf, offset, 8);
  const high = buf.readInt32LE(offset);
  const low = buf.readUInt32LE(offset + 4);
  return new Result((low + (0x100000000 * high)) / MONEY_DIVISOR, offset + 8);
}

function readBit(buf: Buffer, offset: number): Result<boolean> {
  checkDataLength(buf, offset, 1);
  return new Result(!!buf.readUInt8(offset), offset + 1);
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
      checkDataLength(buf, offset, 1);
      const dataLength = buf.readUInt8(offset);
      offset += 1;

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
      checkDataLength(buf, offset, 1);
      const dataLength = buf.readUInt8(offset);
      offset += 1;

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
      checkDataLength(buf, offset, 1);
      const dataLength = buf.readUInt8(offset);
      offset += 1;

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
      checkDataLength(buf, offset, 1);
      const dataLength = buf.readUInt8(offset);
      offset += 1;

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

      checkDataLength(buf, offset, 2);
      const dataLength = buf.readUInt16LE(offset);
      offset += 2;

      if (dataLength === NULL) {
        return new Result(null, offset);
      }

      return readChars(buf, offset, dataLength, codepage);
    }

    case 'NVarChar':
    case 'NChar': {
      checkDataLength(buf, offset, 2);
      const dataLength = buf.readUInt16LE(offset);
      offset += 2;

      if (dataLength === NULL) {
        return new Result(null, offset);
      }

      return readNChars(buf, offset, dataLength);
    }

    case 'VarBinary':
    case 'Binary': {
      checkDataLength(buf, offset, 2);
      const dataLength = buf.readUInt16LE(offset);
      offset += 2;

      if (dataLength === NULL) {
        return new Result(null, offset);
      }

      return readBinary(buf, offset, dataLength);
    }

    case 'Text': {
      checkDataLength(buf, offset, 1);
      const textPointerLength = buf.readUInt8(offset);
      offset += 1;

      if (textPointerLength === 0) {
        return new Result(null, offset);
      }

      // Textpointer and timestamp
      checkDataLength(buf, offset, textPointerLength + 8 + 4);
      offset += textPointerLength + 8;

      const dataLength = buf.readUInt32LE(offset);
      offset += 4;

      return readChars(buf, offset, dataLength, metadata.collation!.codepage!);
    }

    case 'NText': {
      checkDataLength(buf, offset, 1);
      const textPointerLength = buf.readUInt8(offset);
      offset += 1;

      if (textPointerLength === 0) {
        return new Result(null, offset);
      }

      // Textpointer and timestamp
      checkDataLength(buf, offset, textPointerLength + 8 + 4);
      offset += textPointerLength + 8;

      const dataLength = buf.readUInt32LE(offset);
      offset += 4;

      return readNChars(buf, offset, dataLength);
    }

    case 'Image': {
      checkDataLength(buf, offset, 1);
      const textPointerLength = buf.readUInt8(offset);
      offset += 1;

      if (textPointerLength === 0) {
        return new Result(null, offset);
      }

      // Textpointer and timestamp
      checkDataLength(buf, offset, textPointerLength + 8 + 4);
      offset += textPointerLength + 8;

      const dataLength = buf.readUInt32LE(offset);
      offset += 4;

      return readBinary(buf, offset, dataLength);
    }

    case 'SmallDateTime': {
      return readSmallDateTime(buf, offset, options.useUTC);
    }

    case 'DateTime': {
      return readDateTime(buf, offset, options.useUTC);
    }

    case 'DateTimeN': {
      checkDataLength(buf, offset, 1);
      const dataLength = buf.readUInt8(offset);
      offset += 1;

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
      checkDataLength(buf, offset, 1);
      const dataLength = buf.readUInt8(offset);
      offset += 1;

      if (dataLength === 0) {
        return new Result(null, offset);
      }

      return readTime(buf, offset, dataLength, metadata.scale!, options.useUTC);
    }

    case 'Date': {
      checkDataLength(buf, offset, 1);
      const dataLength = buf.readUInt8(offset);
      offset += 1;

      if (dataLength === 0) {
        return new Result(null, offset);
      }

      return readDate(buf, offset, options.useUTC);
    }

    case 'DateTime2': {
      checkDataLength(buf, offset, 1);
      const dataLength = buf.readUInt8(offset);
      offset += 1;

      if (dataLength === 0) {
        return new Result(null, offset);
      }

      return readDateTime2(buf, offset, dataLength, metadata.scale!, options.useUTC);
    }

    case 'DateTimeOffset': {
      checkDataLength(buf, offset, 1);
      const dataLength = buf.readUInt8(offset);
      offset += 1;

      if (dataLength === 0) {
        return new Result(null, offset);
      }

      return readDateTimeOffset(buf, offset, dataLength, metadata.scale!);
    }

    case 'NumericN':
    case 'DecimalN': {
      checkDataLength(buf, offset, 1);
      const dataLength = buf.readUInt8(offset);
      offset += 1;

      if (dataLength === 0) {
        return new Result(null, offset);
      }

      return readNumeric(buf, offset, dataLength, metadata.precision!, metadata.scale!);
    }

    case 'UniqueIdentifier': {
      checkDataLength(buf, offset, 1);
      const dataLength = buf.readUInt8(offset);
      offset += 1;

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
      checkDataLength(buf, offset, 4);
      const dataLength = buf.readUInt32LE(offset);
      offset += 4;

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
  checkDataLength(buf, offset, 0x10);
  const data = buf.slice(offset, offset + 0x10);

  return new Result(options.lowerCaseGuids ? bufferToLowerCaseGuid(data) : bufferToUpperCaseGuid(data), offset + 0x10);
}

function readNumeric(buf: Buffer, offset: number, dataLength: number, _precision: number, scale: number): Result<number> {
  checkDataLength(buf, offset, dataLength);

  const sign = buf.readUInt8(offset) === 1 ? 1 : -1;
  offset += 1;

  let value;
  if (dataLength === 5) {
    value = buf.readUInt32LE(offset);
    offset += 4;
  } else if (dataLength === 9) {
    value = (0x100000000 * buf.readUInt32LE(offset + 4)) + buf.readUInt32LE(offset);
    offset += 8;
  } else if (dataLength === 13) {
    value = buf.readUInt32LE(offset) +
      (0x100000000 * buf.readUInt32LE(offset + 4)) +
      (0x100000000 * 0x100000000 * buf.readUInt32LE(offset + 8));
    offset += 12;
  } else if (dataLength === 17) {
    value = buf.readUInt32LE(offset) +
      (0x100000000 * buf.readUInt32LE(offset + 4)) +
      (0x100000000 * 0x100000000 * buf.readUInt32LE(offset + 8)) +
      (0x100000000 * 0x100000000 * 0x100000000 * buf.readUInt32LE(offset + 12));
    offset += 16;
  } else {
    throw new Error(sprintf('Unsupported numeric dataLength %d', dataLength));
  }

  return new Result((value * sign) / Math.pow(10, scale), offset);
}

function readVariant(buf: Buffer, offset: number, options: ParserOptions, dataLength: number): Result<unknown> {
  checkDataLength(buf, offset, 2);
  const baseType = buf.readUInt8(offset);
  offset += 1;

  const type = TYPE[baseType];

  const propBytes = buf.readUInt8(offset);
  offset += 1;

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
      checkDataLength(buf, offset, 1);
      const scale = buf.readUInt8(offset);
      offset += 1;

      return readTime(buf, offset, dataLength, scale, options.useUTC);
    }

    case 'DateTime2': {
      checkDataLength(buf, offset, 1);
      const scale = buf.readUInt8(offset);
      offset += 1;

      return readDateTime2(buf, offset, dataLength, scale, options.useUTC);
    }

    case 'DateTimeOffset': {
      checkDataLength(buf, offset, 1);
      const scale = buf.readUInt8(offset);
      offset += 1;

      return readDateTimeOffset(buf, offset, dataLength, scale);
    }

    case 'VarBinary':
    case 'Binary': {
      // maxLength (unused?)
      checkDataLength(buf, offset, 2);
      offset += 2;

      return readBinary(buf, offset, dataLength);
    }

    case 'NumericN':
    case 'DecimalN': {
      checkDataLength(buf, offset, 2);
      const precision = buf.readUInt8(offset);
      offset += 1;

      const scale = buf.readUInt8(offset);
      offset += 1;

      return readNumeric(buf, offset, dataLength, precision, scale);
    }

    case 'VarChar':
    case 'Char': {
      // maxLength (unused?)
      checkDataLength(buf, offset, 2);
      offset += 2;

      let collation;
      ({ value: collation, offset } = readCollation(buf, offset));

      return readChars(buf, offset, dataLength, collation.codepage!);
    }

    case 'NVarChar':
    case 'NChar': {
      // maxLength (unused?)
      checkDataLength(buf, offset, 2);
      offset += 2;

      // collation (unused?)
      ({ offset } = readCollation(buf, offset));

      return readNChars(buf, offset, dataLength);
    }

    default:
      throw new Error('Invalid type!');
  }
}

function readBinary(buf: Buffer, offset: number, dataLength: number): Result<Buffer> {
  checkDataLength(buf, offset, dataLength);

  return new Result(buf.slice(offset, offset + dataLength), offset + dataLength);
}

function readChars(buf: Buffer, offset: number, dataLength: number, codepage: string): Result<string> {
  checkDataLength(buf, offset, dataLength);

  return new Result(iconv.decode(buf.slice(offset, offset + dataLength), codepage ?? DEFAULT_ENCODING), offset + dataLength);
}

function readNChars(buf: Buffer, offset: number, dataLength: number): Result<string> {
  checkDataLength(buf, offset, dataLength);

  return new Result(buf.toString('ucs2', offset, offset + dataLength), offset + dataLength);
}

/**
 * Synchronously read a PLP stream from the given buffer, starting at the
 * given offset.
 *
 * Returns the chunks that make up the value (or `null` for a PLP `NULL`),
 * or throws a `NotEnoughDataError` if the buffer does not (yet) contain
 * the full value.
 */
function readPLPStream(buf: Buffer, offset: number): Result<null | Buffer[]> {
  checkDataLength(buf, offset, 8);

  const expectedLength = buf.readBigUInt64LE(offset);
  offset += 8;

  if (expectedLength === PLP_NULL) {
    return new Result(null, offset);
  }

  const chunks: Buffer[] = [];
  let currentLength = 0;

  while (true) {
    checkDataLength(buf, offset, 4);

    const chunkLength = buf.readUInt32LE(offset);
    offset += 4;

    if (!chunkLength) {
      break;
    }

    checkDataLength(buf, offset, chunkLength);

    chunks.push(buf.slice(offset, offset + chunkLength));
    offset += chunkLength;
    currentLength += chunkLength;
  }

  if (expectedLength !== UNKNOWN_PLP_LEN) {
    if (currentLength !== Number(expectedLength)) {
      throw new Error('Partially Length-prefixed Bytes unmatched lengths : expected ' + expectedLength + ', but got ' + currentLength + ' bytes');
    }
  }

  return new Result(chunks, offset);
}

/**
 * Read a PLP stream via the given streaming parser, waiting for additional
 * data to arrive as necessary. Unlike `readPLPStream`, this can incrementally
 * consume values that are larger than the parser's current buffer.
 */
async function readPLPStreamAsync(parser: Parser): Promise<null | Buffer[]> {
  while (parser.buffer.length < parser.position + 8) {
    await parser.waitForChunk(parser.position + 8);
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
      await parser.waitForChunk(parser.position + 4);
    }

    const chunkLength = parser.buffer.readUInt32LE(parser.position);
    parser.position += 4;

    if (!chunkLength) {
      break;
    }

    while (parser.buffer.length < parser.position + chunkLength) {
      await parser.waitForChunk(parser.position + chunkLength);
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
  checkDataLength(buf, offset, 4);

  const days = buf.readUInt16LE(offset);
  const minutes = buf.readUInt16LE(offset + 2);
  offset += 4;

  let value;
  if (useUTC) {
    value = new Date(Date.UTC(1900, 0, 1 + days, 0, minutes));
  } else {
    value = new Date(1900, 0, 1 + days, 0, minutes);
  }

  return new Result(value, offset);
}

function readDateTime(buf: Buffer, offset: number, useUTC: boolean): Result<Date> {
  checkDataLength(buf, offset, 8);

  const days = buf.readInt32LE(offset);
  const threeHundredthsOfSecond = buf.readInt32LE(offset + 4);
  offset += 8;

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
  checkDataLength(buf, offset, dataLength);

  let value;
  switch (dataLength) {
    case 3: {
      value = buf.readUIntLE(offset, 3);
      offset += 3;
      break;
    }

    case 4: {
      value = buf.readUInt32LE(offset);
      offset += 4;
      break;
    }

    case 5: {
      value = buf.readUIntLE(offset, 5);
      offset += 5;
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
  checkDataLength(buf, offset, 3);

  const days = buf.readUIntLE(offset, 3);
  offset += 3;

  if (useUTC) {
    return new Result(new Date(Date.UTC(2000, 0, days - 730118)), offset);
  } else {
    return new Result(new Date(2000, 0, days - 730118), offset);
  }
}

function readDateTime2(buf: Buffer, offset: number, dataLength: number, scale: number, useUTC: boolean): Result<DateWithNanosecondsDelta> {
  let time;
  ({ offset, value: time } = readTime(buf, offset, dataLength - 3, scale, useUTC));

  checkDataLength(buf, offset, 3);

  const days = buf.readUIntLE(offset, 3);
  offset += 3;

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

  checkDataLength(buf, offset, 5);

  const days = buf.readUIntLE(offset, 3);
  // time offset is ignored
  offset += 5;

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
module.exports.readPLPStreamAsync = readPLPStreamAsync;

export { readValue, isPLPStream, readPLPStream, readPLPStreamAsync };
