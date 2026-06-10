import Parser, { type ParserOptions } from './token/stream-parser';
import { type Metadata } from './metadata-parser';
import { Collation } from './collation';
import { TYPE } from './data-type';

import iconv from 'iconv-lite';
import { sprintf } from 'sprintf-js';
import { bufferToLowerCaseGuid, bufferToUpperCaseGuid } from './guid-parser';
import { NotEnoughDataError } from './token/helpers';

const NULL = (1 << 16) - 1;
const MAX = (1 << 16) - 1;
const THREE_AND_A_THIRD = 3 + (1 / 3);
const MONEY_DIVISOR = 10000;
const PLP_NULL = 0xFFFFFFFFFFFFFFFFn;
const UNKNOWN_PLP_LEN = 0xFFFFFFFFFFFFFFFEn;
const DEFAULT_ENCODING = 'utf8';

/**
 * A mutable cursor over a buffer.
 *
 * Read functions advance `position` by the number of bytes consumed and
 * return the read value directly, instead of allocating a `Result` object
 * for every read. When there is not enough data buffered, they throw a
 * `NotEnoughDataError` - `position` may have been advanced partially at that
 * point, so callers need to save and restore it when retrying.
 */
interface Cursor {
  buffer: Buffer;
  position: number;
}

function readUInt8(cursor: Cursor): number {
  const position = cursor.position;

  if (cursor.buffer.length < position + 1) {
    throw new NotEnoughDataError(position + 1);
  }

  cursor.position = position + 1;
  return cursor.buffer.readUInt8(position);
}

function readUInt16LE(cursor: Cursor): number {
  const position = cursor.position;

  if (cursor.buffer.length < position + 2) {
    throw new NotEnoughDataError(position + 2);
  }

  cursor.position = position + 2;
  return cursor.buffer.readUInt16LE(position);
}

function readInt16LE(cursor: Cursor): number {
  const position = cursor.position;

  if (cursor.buffer.length < position + 2) {
    throw new NotEnoughDataError(position + 2);
  }

  cursor.position = position + 2;
  return cursor.buffer.readInt16LE(position);
}

function readUInt24LE(cursor: Cursor): number {
  const position = cursor.position;

  if (cursor.buffer.length < position + 3) {
    throw new NotEnoughDataError(position + 3);
  }

  cursor.position = position + 3;
  return cursor.buffer.readUIntLE(position, 3);
}

function readUInt32LE(cursor: Cursor): number {
  const position = cursor.position;

  if (cursor.buffer.length < position + 4) {
    throw new NotEnoughDataError(position + 4);
  }

  cursor.position = position + 4;
  return cursor.buffer.readUInt32LE(position);
}

function readInt32LE(cursor: Cursor): number {
  const position = cursor.position;

  if (cursor.buffer.length < position + 4) {
    throw new NotEnoughDataError(position + 4);
  }

  cursor.position = position + 4;
  return cursor.buffer.readInt32LE(position);
}

function readUInt40LE(cursor: Cursor): number {
  const position = cursor.position;

  if (cursor.buffer.length < position + 5) {
    throw new NotEnoughDataError(position + 5);
  }

  cursor.position = position + 5;
  return cursor.buffer.readUIntLE(position, 5);
}

function readBigInt64LE(cursor: Cursor): bigint {
  const position = cursor.position;

  if (cursor.buffer.length < position + 8) {
    throw new NotEnoughDataError(position + 8);
  }

  cursor.position = position + 8;
  return cursor.buffer.readBigInt64LE(position);
}

function readFloatLE(cursor: Cursor): number {
  const position = cursor.position;

  if (cursor.buffer.length < position + 4) {
    throw new NotEnoughDataError(position + 4);
  }

  cursor.position = position + 4;
  return cursor.buffer.readFloatLE(position);
}

function readDoubleLE(cursor: Cursor): number {
  const position = cursor.position;

  if (cursor.buffer.length < position + 8) {
    throw new NotEnoughDataError(position + 8);
  }

  cursor.position = position + 8;
  return cursor.buffer.readDoubleLE(position);
}

function readUNumeric64LE(cursor: Cursor): number {
  const position = cursor.position;

  if (cursor.buffer.length < position + 8) {
    throw new NotEnoughDataError(position + 8);
  }

  const low = cursor.buffer.readUInt32LE(position);
  const high = cursor.buffer.readUInt32LE(position + 4);

  cursor.position = position + 8;
  return (0x100000000 * high) + low;
}

function readUNumeric96LE(cursor: Cursor): number {
  const position = cursor.position;

  if (cursor.buffer.length < position + 12) {
    throw new NotEnoughDataError(position + 12);
  }

  const dword1 = cursor.buffer.readUInt32LE(position);
  const dword2 = cursor.buffer.readUInt32LE(position + 4);
  const dword3 = cursor.buffer.readUInt32LE(position + 8);

  cursor.position = position + 12;
  return dword1 + (0x100000000 * dword2) + (0x100000000 * 0x100000000 * dword3);
}

function readUNumeric128LE(cursor: Cursor): number {
  const position = cursor.position;

  if (cursor.buffer.length < position + 16) {
    throw new NotEnoughDataError(position + 16);
  }

  const dword1 = cursor.buffer.readUInt32LE(position);
  const dword2 = cursor.buffer.readUInt32LE(position + 4);
  const dword3 = cursor.buffer.readUInt32LE(position + 8);
  const dword4 = cursor.buffer.readUInt32LE(position + 12);

  cursor.position = position + 16;
  return dword1 + (0x100000000 * dword2) + (0x100000000 * 0x100000000 * dword3) + (0x100000000 * 0x100000000 * 0x100000000 * dword4);
}

function readCollation(cursor: Cursor): Collation {
  const position = cursor.position;

  if (cursor.buffer.length < position + 5) {
    throw new NotEnoughDataError(position + 5);
  }

  cursor.position = position + 5;
  return Collation.fromBuffer(cursor.buffer.slice(position, position + 5));
}

function readTinyInt(cursor: Cursor): number {
  return readUInt8(cursor);
}

function readSmallInt(cursor: Cursor): number {
  return readInt16LE(cursor);
}

function readInt(cursor: Cursor): number {
  return readInt32LE(cursor);
}

function readBigInt(cursor: Cursor): string {
  return readBigInt64LE(cursor).toString();
}

function readReal(cursor: Cursor): number {
  return readFloatLE(cursor);
}

function readFloat(cursor: Cursor): number {
  return readDoubleLE(cursor);
}

function readSmallMoney(cursor: Cursor): number {
  return readInt32LE(cursor) / MONEY_DIVISOR;
}

function readMoney(cursor: Cursor): number {
  const high = readInt32LE(cursor);
  const low = readUInt32LE(cursor);

  return (low + (0x100000000 * high)) / MONEY_DIVISOR;
}

function readBit(cursor: Cursor): boolean {
  return !!readUInt8(cursor);
}

function readValue(cursor: Cursor, metadata: Metadata, options: ParserOptions): unknown {
  const type = metadata.type;

  switch (type.name) {
    case 'Null':
      return null;

    case 'TinyInt': {
      return readTinyInt(cursor);
    }

    case 'SmallInt': {
      return readSmallInt(cursor);
    }

    case 'Int': {
      return readInt(cursor);
    }

    case 'BigInt': {
      return readBigInt(cursor);
    }

    case 'IntN': {
      const dataLength = readUInt8(cursor);

      switch (dataLength) {
        case 0:
          return null;

        case 1:
          return readTinyInt(cursor);
        case 2:
          return readSmallInt(cursor);
        case 4:
          return readInt(cursor);
        case 8:
          return readBigInt(cursor);

        default:
          throw new Error('Unsupported dataLength ' + dataLength + ' for IntN');
      }
    }

    case 'Real': {
      return readReal(cursor);
    }

    case 'Float': {
      return readFloat(cursor);
    }

    case 'FloatN': {
      const dataLength = readUInt8(cursor);

      switch (dataLength) {
        case 0:
          return null;

        case 4:
          return readReal(cursor);
        case 8:
          return readFloat(cursor);

        default:
          throw new Error('Unsupported dataLength ' + dataLength + ' for FloatN');
      }
    }

    case 'SmallMoney': {
      return readSmallMoney(cursor);
    }

    case 'Money':
      return readMoney(cursor);

    case 'MoneyN': {
      const dataLength = readUInt8(cursor);

      switch (dataLength) {
        case 0:
          return null;

        case 4:
          return readSmallMoney(cursor);
        case 8:
          return readMoney(cursor);

        default:
          throw new Error('Unsupported dataLength ' + dataLength + ' for MoneyN');
      }
    }

    case 'Bit': {
      return readBit(cursor);
    }

    case 'BitN': {
      const dataLength = readUInt8(cursor);

      switch (dataLength) {
        case 0:
          return null;

        case 1:
          return readBit(cursor);

        default:
          throw new Error('Unsupported dataLength ' + dataLength + ' for BitN');
      }
    }

    case 'VarChar':
    case 'Char': {
      const codepage = metadata.collation!.codepage!;

      const dataLength = readUInt16LE(cursor);

      if (dataLength === NULL) {
        return null;
      }

      return readChars(cursor, dataLength, codepage);
    }

    case 'NVarChar':
    case 'NChar': {
      const dataLength = readUInt16LE(cursor);

      if (dataLength === NULL) {
        return null;
      }

      return readNChars(cursor, dataLength);
    }

    case 'VarBinary':
    case 'Binary': {
      const dataLength = readUInt16LE(cursor);

      if (dataLength === NULL) {
        return null;
      }

      return readBinary(cursor, dataLength);
    }

    case 'Text': {
      const textPointerLength = readUInt8(cursor);

      if (textPointerLength === 0) {
        return null;
      }

      // Textpointer
      readBinary(cursor, textPointerLength);

      // Timestamp
      readBinary(cursor, 8);

      const dataLength = readUInt32LE(cursor);

      return readChars(cursor, dataLength, metadata.collation!.codepage!);
    }

    case 'NText': {
      const textPointerLength = readUInt8(cursor);

      if (textPointerLength === 0) {
        return null;
      }

      // Textpointer
      readBinary(cursor, textPointerLength);

      // Timestamp
      readBinary(cursor, 8);

      const dataLength = readUInt32LE(cursor);

      return readNChars(cursor, dataLength);
    }

    case 'Image': {
      const textPointerLength = readUInt8(cursor);

      if (textPointerLength === 0) {
        return null;
      }

      // Textpointer
      readBinary(cursor, textPointerLength);

      // Timestamp
      readBinary(cursor, 8);

      const dataLength = readUInt32LE(cursor);

      return readBinary(cursor, dataLength);
    }

    case 'SmallDateTime': {
      return readSmallDateTime(cursor, options.useUTC);
    }

    case 'DateTime': {
      return readDateTime(cursor, options.useUTC);
    }

    case 'DateTimeN': {
      const dataLength = readUInt8(cursor);

      switch (dataLength) {
        case 0:
          return null;

        case 4:
          return readSmallDateTime(cursor, options.useUTC);
        case 8:
          return readDateTime(cursor, options.useUTC);

        default:
          throw new Error('Unsupported dataLength ' + dataLength + ' for DateTimeN');
      }
    }

    case 'Time': {
      const dataLength = readUInt8(cursor);

      if (dataLength === 0) {
        return null;
      }

      return readTime(cursor, dataLength, metadata.scale!, options.useUTC);
    }

    case 'Date': {
      const dataLength = readUInt8(cursor);

      if (dataLength === 0) {
        return null;
      }

      return readDate(cursor, options.useUTC);
    }

    case 'DateTime2': {
      const dataLength = readUInt8(cursor);

      if (dataLength === 0) {
        return null;
      }

      return readDateTime2(cursor, dataLength, metadata.scale!, options.useUTC);
    }

    case 'DateTimeOffset': {
      const dataLength = readUInt8(cursor);

      if (dataLength === 0) {
        return null;
      }

      return readDateTimeOffset(cursor, dataLength, metadata.scale!);
    }

    case 'NumericN':
    case 'DecimalN': {
      const dataLength = readUInt8(cursor);

      if (dataLength === 0) {
        return null;
      }

      return readNumeric(cursor, dataLength, metadata.precision!, metadata.scale!);
    }

    case 'UniqueIdentifier': {
      const dataLength = readUInt8(cursor);

      switch (dataLength) {
        case 0:
          return null;

        case 0x10:
          return readUniqueIdentifier(cursor, options);

        default:
          throw new Error(sprintf('Unsupported guid size %d', dataLength - 1));
      }
    }

    case 'Variant': {
      const dataLength = readUInt32LE(cursor);

      if (dataLength === 0) {
        return null;
      }

      return readVariant(cursor, options, dataLength);
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

function readUniqueIdentifier(cursor: Cursor, options: ParserOptions): string {
  const data = readBinary(cursor, 0x10);

  return options.lowerCaseGuids ? bufferToLowerCaseGuid(data) : bufferToUpperCaseGuid(data);
}

function readNumeric(cursor: Cursor, dataLength: number, _precision: number, scale: number): number {
  const sign = readUInt8(cursor) === 1 ? 1 : -1;

  let value;
  if (dataLength === 5) {
    value = readUInt32LE(cursor);
  } else if (dataLength === 9) {
    value = readUNumeric64LE(cursor);
  } else if (dataLength === 13) {
    value = readUNumeric96LE(cursor);
  } else if (dataLength === 17) {
    value = readUNumeric128LE(cursor);
  } else {
    throw new Error(sprintf('Unsupported numeric dataLength %d', dataLength));
  }

  return (value * sign) / Math.pow(10, scale);
}

function readVariant(cursor: Cursor, options: ParserOptions, dataLength: number): unknown {
  const baseType = readUInt8(cursor);

  const type = TYPE[baseType];

  const propBytes = readUInt8(cursor);

  dataLength = dataLength - propBytes - 2;

  switch (type.name) {
    case 'UniqueIdentifier':
      return readUniqueIdentifier(cursor, options);

    case 'Bit':
      return readBit(cursor);

    case 'TinyInt':
      return readTinyInt(cursor);

    case 'SmallInt':
      return readSmallInt(cursor);

    case 'Int':
      return readInt(cursor);

    case 'BigInt':
      return readBigInt(cursor);

    case 'SmallDateTime':
      return readSmallDateTime(cursor, options.useUTC);

    case 'DateTime':
      return readDateTime(cursor, options.useUTC);

    case 'Real':
      return readReal(cursor);

    case 'Float':
      return readFloat(cursor);

    case 'SmallMoney':
      return readSmallMoney(cursor);

    case 'Money':
      return readMoney(cursor);

    case 'Date':
      return readDate(cursor, options.useUTC);

    case 'Time': {
      const scale = readUInt8(cursor);

      return readTime(cursor, dataLength, scale, options.useUTC);
    }

    case 'DateTime2': {
      const scale = readUInt8(cursor);

      return readDateTime2(cursor, dataLength, scale, options.useUTC);
    }

    case 'DateTimeOffset': {
      const scale = readUInt8(cursor);

      return readDateTimeOffset(cursor, dataLength, scale);
    }

    case 'VarBinary':
    case 'Binary': {
      // maxLength (unused?)
      readUInt16LE(cursor);

      return readBinary(cursor, dataLength);
    }

    case 'NumericN':
    case 'DecimalN': {
      const precision = readUInt8(cursor);
      const scale = readUInt8(cursor);

      return readNumeric(cursor, dataLength, precision, scale);
    }

    case 'VarChar':
    case 'Char': {
      // maxLength (unused?)
      readUInt16LE(cursor);

      const collation = readCollation(cursor);

      return readChars(cursor, dataLength, collation.codepage!);
    }

    case 'NVarChar':
    case 'NChar': {
      // maxLength (unused?)
      readUInt16LE(cursor);

      // collation (unused?)
      readCollation(cursor);

      return readNChars(cursor, dataLength);
    }

    default:
      throw new Error('Invalid type!');
  }
}

function readBinary(cursor: Cursor, dataLength: number): Buffer {
  const position = cursor.position;

  if (cursor.buffer.length < position + dataLength) {
    throw new NotEnoughDataError(position + dataLength);
  }

  cursor.position = position + dataLength;
  return cursor.buffer.slice(position, position + dataLength);
}

function readChars(cursor: Cursor, dataLength: number, codepage: string): string {
  const position = cursor.position;

  if (cursor.buffer.length < position + dataLength) {
    throw new NotEnoughDataError(position + dataLength);
  }

  cursor.position = position + dataLength;
  return iconv.decode(cursor.buffer.slice(position, position + dataLength), codepage ?? DEFAULT_ENCODING);
}

function readNChars(cursor: Cursor, dataLength: number): string {
  const position = cursor.position;

  if (cursor.buffer.length < position + dataLength) {
    throw new NotEnoughDataError(position + dataLength);
  }

  cursor.position = position + dataLength;
  return cursor.buffer.toString('ucs2', position, position + dataLength);
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

function readSmallDateTime(cursor: Cursor, useUTC: boolean): Date {
  const days = readUInt16LE(cursor);
  const minutes = readUInt16LE(cursor);

  if (useUTC) {
    return new Date(Date.UTC(1900, 0, 1 + days, 0, minutes));
  } else {
    return new Date(1900, 0, 1 + days, 0, minutes);
  }
}

function readDateTime(cursor: Cursor, useUTC: boolean): Date {
  const days = readInt32LE(cursor);
  const threeHundredthsOfSecond = readInt32LE(cursor);

  const milliseconds = Math.round(threeHundredthsOfSecond * THREE_AND_A_THIRD);

  if (useUTC) {
    return new Date(Date.UTC(1900, 0, 1 + days, 0, 0, 0, milliseconds));
  } else {
    return new Date(1900, 0, 1 + days, 0, 0, 0, milliseconds);
  }
}

interface DateWithNanosecondsDelta extends Date {
  nanosecondsDelta: number;
}

function readTime(cursor: Cursor, dataLength: number, scale: number, useUTC: boolean): DateWithNanosecondsDelta {
  let value;

  switch (dataLength) {
    case 3: {
      value = readUInt24LE(cursor);
      break;
    }

    case 4: {
      value = readUInt32LE(cursor);
      break;
    }

    case 5: {
      value = readUInt40LE(cursor);
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

  return date;
}

function readDate(cursor: Cursor, useUTC: boolean): Date {
  const days = readUInt24LE(cursor);

  if (useUTC) {
    return new Date(Date.UTC(2000, 0, days - 730118));
  } else {
    return new Date(2000, 0, days - 730118);
  }
}

function readDateTime2(cursor: Cursor, dataLength: number, scale: number, useUTC: boolean): DateWithNanosecondsDelta {
  const time = readTime(cursor, dataLength - 3, scale, useUTC);

  const days = readUInt24LE(cursor);

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

  return date;
}

function readDateTimeOffset(cursor: Cursor, dataLength: number, scale: number): DateWithNanosecondsDelta {
  const time = readTime(cursor, dataLength - 5, scale, true);

  const days = readUInt24LE(cursor);

  // time offset?
  readUInt16LE(cursor);

  const date = new Date(Date.UTC(2000, 0, days - 730118, 0, 0, 0, +time)) as DateWithNanosecondsDelta;
  Object.defineProperty(date, 'nanosecondsDelta', {
    enumerable: false,
    value: time.nanosecondsDelta
  });
  return date;
}

module.exports.readValue = readValue;
module.exports.isPLPStream = isPLPStream;
module.exports.readPLPStream = readPLPStream;

export { readValue, isPLPStream, readPLPStream };
