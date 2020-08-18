import { Metadata, readCollation } from './metadata-parser';
import { InternalConnectionOptions } from './connection';
import { TYPE } from './data-type';

import iconv from 'iconv-lite';
import { sprintf } from 'sprintf-js';
import { bufferToLowerCaseGuid, bufferToUpperCaseGuid } from './guid-parser';
import { Result, uInt32LE, uInt8, int16LE, int32LE, bigInt64LE, floatLE, doubleLE, uInt16LE, uInt24LE, uInt40LE, IncompleteError, uNumeric96LE, uNumeric128LE, uNumeric64LE, bigUInt64LE } from './parser';
import JSBI from 'jsbi';

const NULL = (1 << 16) - 1;
const MAX = (1 << 16) - 1;
const THREE_AND_A_THIRD = 3 + (1 / 3);
const MONEY_DIVISOR = 10000;
const PLP_NULL = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
const UNKNOWN_PLP_LEN = Buffer.from([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
const DEFAULT_ENCODING = 'utf8';

function readTinyInt(buffer: Buffer, offset: number) {
  return uInt8(buffer, offset);
}

function readSmallInt(buffer: Buffer, offset: number) {
  return int16LE(buffer, offset);
}

function readInt(buffer: Buffer, offset: number) {
  return int32LE(buffer, offset);
}

function readBigInt(buffer: Buffer, offset: number) {
  let value;
  ({ offset, value: value } = bigInt64LE(buffer, offset));
  return new Result(offset, value.toString());
}

function readIntN(buffer: Buffer, offset: number) {
  let dataLength;
  ({ offset, value: dataLength } = uInt8(buffer, offset));

  switch (dataLength) {
    case 0:
      return new Result(offset, null);

    case 1:
      return readTinyInt(buffer, offset);
    case 2:
      return readSmallInt(buffer, offset);
    case 4:
      return readInt(buffer, offset);
    case 8:
      return readBigInt(buffer, offset);

    default:
      throw new Error('Unsupported dataLength ' + dataLength + ' for IntN');
  }
}

function readReal(buffer: Buffer, offset: number) {
  return floatLE(buffer, offset);
}

function readFloat(buffer: Buffer, offset: number) {
  return doubleLE(buffer, offset);
}

function readFloatN(buffer: Buffer, offset: number) {
  let dataLength;
  ({ offset, value: dataLength } = uInt8(buffer, offset));

  switch (dataLength) {
    case 0:
      return new Result(offset, null);

    case 4:
      return readReal(buffer, offset);
    case 8:
      return readFloat(buffer, offset);

    default:
      throw new Error('Unsupported dataLength ' + dataLength + ' for FloatN');
  }
}

function readSmallMoney(buffer: Buffer, offset: number) {
  let value;
  ({ offset, value: value } = int32LE(buffer, offset));
  return new Result(offset, value / MONEY_DIVISOR);
}

function readMoney(buffer: Buffer, offset: number) {
  let high, low;
  ({ offset, value: high } = int32LE(buffer, offset));
  ({ offset, value: low } = uInt32LE(buffer, offset));
  return new Result(offset, (low + (0x100000000 * high)) / MONEY_DIVISOR);
}

function readMoneyN(buffer: Buffer, offset: number) {
  let dataLength;
  ({ offset, value: dataLength } = uInt8(buffer, offset));

  switch (dataLength) {
    case 0:
      return new Result(offset, null);

    case 4:
      return readSmallMoney(buffer, offset);
    case 8:
      return readMoney(buffer, offset);

    default:
      throw new Error('Unsupported dataLength ' + dataLength + ' for MoneyN');
  }
}

function readBit(buffer: Buffer, offset: number) {
  let value;
  ({ offset, value } = uInt8(buffer, offset));
  return new Result(offset, !!value);
}

function readBitN(buffer: Buffer, offset: number) {
  let dataLength;
  ({ offset, value: dataLength } = uInt8(buffer, offset));

  switch (dataLength) {
    case 0:
      return new Result(offset, null);

    case 1:
      return readBit(buffer, offset);

    default:
      throw new Error('Unsupported dataLength ' + dataLength + ' for BitN');
  }
}

function readText(buffer: Buffer, offset: number, metadata: Metadata) {
  let textPointerLength;
  ({ offset, value: textPointerLength } = uInt8(buffer, offset));

  if (textPointerLength === 0) {
    return new Result(offset, null);
  }

  // TODO: read textpointer
  if (buffer.length < offset + textPointerLength) {
    throw new IncompleteError();
  }
  offset += textPointerLength;

  // TODO: read timestamp
  if (buffer.length < offset + 8) {
    throw new IncompleteError();
  }
  offset += 8;

  let dataLength;
  ({ offset, value: dataLength } = uInt32LE(buffer, offset));

  let codepage = metadata.collation!.codepage;
  if (codepage == null) {
    codepage = DEFAULT_ENCODING;
  }

  if (buffer.length < offset + dataLength) {
    throw new IncompleteError();
  }
  const data = buffer.slice(offset, offset += dataLength);

  return new Result(offset, iconv.decode(data, codepage));
}

function readNText(buffer: Buffer, offset: number, metadata: Metadata) {
  let textPointerLength;
  ({ offset, value: textPointerLength } = uInt8(buffer, offset));

  if (textPointerLength === 0) {
    return new Result(offset, null);
  }

  // TODO: read textpointer
  if (buffer.length < offset + textPointerLength) {
    throw new IncompleteError();
  }
  offset += textPointerLength;

  // TODO: read timestamp
  if (buffer.length < offset + 8) {
    throw new IncompleteError();
  }
  offset += 8;

  let dataLength;
  ({ offset, value: dataLength } = uInt32LE(buffer, offset));

  let codepage = metadata.collation!.codepage;
  if (codepage == null) {
    codepage = DEFAULT_ENCODING;
  }

  if (buffer.length < offset + dataLength) {
    throw new IncompleteError();
  }
  const data = buffer.slice(offset, offset += dataLength);

  return new Result(offset, data.toString('ucs2'));
}

function readImage(buffer: Buffer, offset: number) {
  let textPointerLength;
  ({ offset, value: textPointerLength } = uInt8(buffer, offset));

  if (textPointerLength === 0) {
    return new Result(offset, null);
  }

  // TODO: read textpointer
  if (buffer.length < offset + textPointerLength) {
    throw new IncompleteError();
  }
  offset += textPointerLength;

  // TODO: read timestamp
  if (buffer.length < offset + 8) {
    throw new IncompleteError();
  }
  offset += 8;

  let dataLength;
  ({ offset, value: dataLength } = uInt32LE(buffer, offset));

  if (buffer.length < offset + dataLength) {
    throw new IncompleteError();
  }
  const data = buffer.slice(offset, offset += dataLength);

  return new Result(offset, data);
}

export function isPLPStream({ type: { name }, dataLength }: Metadata) {
  switch (name) {
    case 'Xml':
    case 'UDT':
      return true;

    case 'VarChar':
    case 'Char':
    case 'NVarChar':
    case 'NChar':
    case 'VarBinary':
    case 'Binary':
      return dataLength === MAX;

    default:
      return false;
  }
}

function valueParse(buffer: Buffer, offset: number, metadata: Metadata, options: InternalConnectionOptions) {
  const type = metadata.type;

  switch (type.name) {
    case 'Xml':
      return readMaxNChars(buffer, offset);

    case 'VarChar':
    case 'Char': {
      if (metadata.dataLength === MAX) {
        const codepage = metadata.collation!.codepage;
        return readMaxChars(buffer, offset, codepage);
      }

      break;
    }

    case 'NVarChar':
    case 'NChar': {
      if (metadata.dataLength === MAX) {
        return readMaxNChars(buffer, offset);
      }

      break;
    }

    case 'VarBinary':
    case 'Binary': {
      if (metadata.dataLength === MAX) {
        return readMaxBinary(buffer, offset);
      }

      break;
    }

    case 'UDT':
      return readMaxBinary(buffer, offset);
  }

  return valueParseNew(buffer, offset, metadata, options);
}

function valueParseNew(buffer: Buffer, offset: number, metadata: Metadata, options: InternalConnectionOptions): Result<unknown> {
  const type = metadata.type;

  switch (type.name) {
    case 'Null':
      return new Result(offset, null);

    case 'TinyInt':
      return readTinyInt(buffer, offset);

    case 'SmallInt':
      return readSmallInt(buffer, offset);

    case 'Int':
      return readInt(buffer, offset);

    case 'BigInt':
      return readBigInt(buffer, offset);

    case 'IntN':
      return readIntN(buffer, offset);

    case 'Real':
      return readReal(buffer, offset);

    case 'Float':
      return readFloat(buffer, offset);

    case 'FloatN':
      return readFloatN(buffer, offset);

    case 'SmallMoney':
      return readSmallMoney(buffer, offset);

    case 'Money':
      return readMoney(buffer, offset);

    case 'MoneyN':
      return readMoneyN(buffer, offset);

    case 'Bit':
      return readBit(buffer, offset);

    case 'BitN':
      return readBitN(buffer, offset);

    case 'VarChar':
    case 'Char': {
      let dataLength;
      ({ offset, value: dataLength } = uInt16LE(buffer, offset));

      const codepage = metadata.collation!.codepage;
      return readChars(buffer, offset, dataLength, codepage);
    }

    case 'NVarChar':
    case 'NChar': {
      let dataLength;
      ({ offset, value: dataLength } = uInt16LE(buffer, offset));

      if (dataLength === NULL) {
        return new Result(offset, null);
      }

      const codepage = metadata.collation!.codepage;
      return readNChars(buffer, offset, dataLength, codepage);
    }

    case 'VarBinary':
    case 'Binary': {
      let dataLength;
      ({ offset, value: dataLength } = uInt16LE(buffer, offset));

      if (dataLength === NULL) {
        return new Result(offset, null);
      }

      return readBinary(buffer, offset, dataLength);
    }

    case 'Text':
      return readText(buffer, offset, metadata);

    case 'NText':
      return readNText(buffer, offset, metadata);

    case 'Image':
      return readImage(buffer, offset);

    case 'SmallDateTime':
      return readSmallDateTime(buffer, offset, options.useUTC);

    case 'DateTime':
      return readDateTime(buffer, offset, options.useUTC);

    case 'DateTimeN':
      return readDateTimeN(buffer, offset, options.useUTC);

    case 'Time': {
      let dataLength;
      ({ offset, value: dataLength } = uInt8(buffer, offset));

      if (dataLength === 0) {
        return new Result(offset, null);
      }

      return readTime(buffer, offset, dataLength, metadata.scale!, options.useUTC);
    }

    case 'Date': {
      let dataLength;
      ({ offset, value: dataLength } = uInt8(buffer, offset));

      if (dataLength === 0) {
        return new Result(offset, null);
      }

      return readDate(buffer, offset, options.useUTC);
    }

    case 'DateTime2': {
      let dataLength;
      ({ offset, value: dataLength } = uInt8(buffer, offset));

      if (dataLength === 0) {
        return new Result(offset, null);
      }

      return readDateTime2(buffer, offset, dataLength, metadata.scale!, options.useUTC);
    }

    case 'DateTimeOffset': {
      let dataLength;
      ({ offset, value: dataLength } = uInt8(buffer, offset));

      if (dataLength === 0) {
        return new Result(offset, null);
      }

      return readDateTimeOffset(buffer, offset, dataLength, metadata.scale!);
    }

    case 'NumericN':
    case 'DecimalN': {
      let dataLength;
      ({ offset, value: dataLength } = uInt8(buffer, offset));

      if (dataLength === 0) {
        return new Result(offset, null);
      } else {
        return readNumeric(buffer, offset, dataLength, metadata.precision!, metadata.scale!);
      }
    }

    case 'UniqueIdentifier': {
      let dataLength;
      ({ offset, value: dataLength } = uInt8(buffer, offset));

      switch (dataLength) {
        case 0:
          return new Result(offset, null);

        case 0x10:
          return readUniqueIdentifier(buffer, offset, options);

        default:
          throw new Error(sprintf('Unsupported guid size %d', dataLength! - 1));
      }
    }

    case 'Variant': {
      let dataLength;
      ({ offset, value: dataLength } = uInt32LE(buffer, offset));

      if (dataLength === 0) {
        return new Result(offset, null);
      }

      return readVariant(buffer, offset, options, dataLength!);
    }

    default:
      throw new Error(sprintf('Unrecognised type %s', type.name));
  }
}

function readUniqueIdentifier(buffer: Buffer, offset: number, options: InternalConnectionOptions) {
  if (buffer.length < offset + 16) {
    throw new IncompleteError();
  }

  const data = buffer.slice(offset, offset += 16);
  return new Result(offset, options.lowerCaseGuids ? bufferToLowerCaseGuid(data) : bufferToUpperCaseGuid(data));
}

function readNumeric(buffer: Buffer, offset: number, dataLength: number, _precision: number, scale: number) {
  let sign;
  ({ offset, value: sign } = uInt8(buffer, offset));

  sign = sign === 1 ? 1 : -1;

  let value;
  if (dataLength === 5) {
    ({ offset, value } = uInt32LE(buffer, offset));
  } else if (dataLength === 9) {
    ({ offset, value } = uNumeric64LE(buffer, offset));
  } else if (dataLength === 13) {
    ({ offset, value } = uNumeric96LE(buffer, offset));
  } else if (dataLength === 17) {
    ({ offset, value } = uNumeric128LE(buffer, offset));
  } else {
    throw new Error(sprintf('Unsupported numeric dataLength %d', dataLength));
  }

  return new Result(offset, (value * sign) / Math.pow(10, scale));
}

function readVariant(buffer: Buffer, offset: number, options: InternalConnectionOptions, dataLength: number) {
  let baseType;
  ({ offset, value: baseType } = uInt8(buffer, offset));

  const type = TYPE[baseType];

  let propBytes;
  ({ offset, value: propBytes } = uInt8(buffer, offset));

  dataLength = dataLength - propBytes - 2;

  switch (type.name) {
    case 'UniqueIdentifier':
      return readUniqueIdentifier(buffer, offset, options);

    case 'Bit':
      return readBit(buffer, offset);

    case 'TinyInt':
      return readTinyInt(buffer, offset);

    case 'SmallInt':
      return readSmallInt(buffer, offset);

    case 'Int':
      return readInt(buffer, offset);

    case 'BigInt':
      return readBigInt(buffer, offset);

    case 'SmallDateTime':
      return readSmallDateTime(buffer, offset, options.useUTC);

    case 'DateTime':
      return readDateTime(buffer, offset, options.useUTC);

    case 'Real':
      return readReal(buffer, offset);

    case 'Float':
      return readFloat(buffer, offset);

    case 'SmallMoney':
      return readSmallMoney(buffer, offset);

    case 'Money':
      return readMoney(buffer, offset);

    case 'Date':
      return readDate(buffer, offset, options.useUTC);

    case 'Time': {
      let scale;
      ({ offset, value: scale } = uInt8(buffer, offset));

      return readTime(buffer, offset, dataLength, scale, options.useUTC);
    }

    case 'DateTime2': {
      let scale;
      ({ offset, value: scale } = uInt8(buffer, offset));

      return readDateTime2(buffer, offset, dataLength, scale, options.useUTC);
    }

    case 'DateTimeOffset': {
      let scale;
      ({ offset, value: scale } = uInt8(buffer, offset));

      return readDateTimeOffset(buffer, offset, dataLength, scale);
    }

    case 'VarBinary':
    case 'Binary': {
      // Skip maxLength
      ({ offset } = uInt16LE(buffer, offset));

      return readBinary(buffer, offset, dataLength);
    }

    case 'NumericN':
    case 'DecimalN': {
      let precision;
      ({ offset, value: precision } = uInt8(buffer, offset));

      let scale;
      ({ offset, value: scale } = uInt8(buffer, offset));

      return readNumeric(buffer, offset, dataLength, precision, scale);
    }

    case 'VarChar':
    case 'Char': {
      // Skip maxLength
      ({ offset } = uInt16LE(buffer, offset));

      let collation;
      ({ offset, value: collation } = readCollation(buffer, offset));

      return readChars(buffer, offset, dataLength, collation!.codepage);
    }

    case 'NVarChar':
    case 'NChar': {
      // Skip maxLength
      ({ offset } = uInt16LE(buffer, offset));

      let collation;
      ({ offset, value: collation } = readCollation(buffer, offset));

      return readNChars(buffer, offset, dataLength, collation!.codepage);
    }

    default:
      throw new Error('Invalid type!');
  }
}

function readBinary(buffer: Buffer, offset: number, dataLength: number) {
  if (buffer.length < offset + dataLength) {
    throw new IncompleteError();
  }

  const data = buffer.slice(offset, offset += dataLength);
  return new Result(offset, data);
}

function readChars(buffer: Buffer, offset: number, dataLength: number, codepage: string) {
  if (buffer.length < offset + dataLength) {
    throw new IncompleteError();
  }

  if (codepage == null) {
    codepage = DEFAULT_ENCODING;
  }

  const data = buffer.slice(offset, offset += dataLength);
  return new Result(offset, iconv.decode(data, codepage));
}

function readNChars(buffer: Buffer, offset: number, dataLength: number, codepage: string) {
  if (buffer.length < offset + dataLength) {
    throw new IncompleteError();
  }

  const value = buffer.toString('ucs2', offset, offset += dataLength);
  return new Result(offset, value);
}

function readMaxBinary(buffer: Buffer, offset: number) {
  return readMax(buffer, offset);
}

function readMaxChars(buffer: Buffer, offset: number, codepage: string) {
  if (codepage == null) {
    codepage = DEFAULT_ENCODING;
  }

  let value;
  ({ offset, value } = readMax(buffer, offset));

  if (value) {
    return new Result(offset, iconv.decode(value, codepage));
  } else {
    return new Result(offset, value);
  }
}

function readMaxNChars(buffer: Buffer, offset: number) {
  let value;
  ({ offset, value } = readMax(buffer, offset));

  if (value) {
    return new Result(offset, value.toString('ucs2'));
  } else {
    return new Result(offset, value);
  }
}

function readMax(buffer: Buffer, offset: number): Result<null | Buffer> {
  if (buffer.length < offset + 8) {
    throw new IncompleteError();
  }

  const type = buffer.slice(offset, offset += 8);
  if (type.equals(PLP_NULL)) {
    return new Result(offset, null);
  }

  if (type.equals(UNKNOWN_PLP_LEN)) {
    return readPLPChunks(buffer, offset, undefined);
  }

  let bigTotalLength;
  ({ offset, value: bigTotalLength } = bigUInt64LE(buffer, offset));
  const totalLength = JSBI.toNumber(bigTotalLength);
  return readPLPChunks(buffer, offset, totalLength);
}

function readPLPChunks(buffer: Buffer, offset: number, totalLength: number | undefined) {
  const chunks: Buffer[] = [];
  let chunkLength;

  while (true) {
    ({ offset, value: chunkLength } = uInt32LE(buffer, offset));

    if (!chunkLength) {
      const data = Buffer.concat(chunks);

      if (totalLength && data.length !== totalLength) {
        throw new Error('Partially Length-prefixed Bytes unmatched lengths : expected ' + totalLength + ', but got ' + data.length + ' bytes');
      }

      return new Result(offset, data);
    }

    if (buffer.length < offset + chunkLength) {
      throw new IncompleteError();
    }

    chunks.push(buffer.slice(offset, offset += chunkLength));
  }
}

function readSmallDateTime(buffer: Buffer, offset: number, useUTC: boolean) {
  let days;
  ({ offset, value: days } = uInt16LE(buffer, offset));

  let minutes;
  ({ offset, value: minutes } = uInt16LE(buffer, offset));

  let value;
  if (useUTC) {
    value = new Date(Date.UTC(1900, 0, 1 + days, 0, minutes));
  } else {
    value = new Date(1900, 0, 1 + days, 0, minutes);
  }

  return new Result(offset, value);
}

function readDateTime(buffer: Buffer, offset: number, useUTC: boolean) {
  let days;
  ({ offset, value: days } = int32LE(buffer, offset));

  let threeHundredthsOfSecond;
  ({ offset, value: threeHundredthsOfSecond } = uInt32LE(buffer, offset));

  const milliseconds = Math.round(threeHundredthsOfSecond * THREE_AND_A_THIRD);

  let value;
  if (useUTC) {
    value = new Date(Date.UTC(1900, 0, 1 + days, 0, 0, 0, milliseconds));
  } else {
    value = new Date(1900, 0, 1 + days, 0, 0, 0, milliseconds);
  }

  return new Result(offset, value);
}

function readDateTimeN(buffer: Buffer, offset: number, useUTC: boolean) {
  let dataLength;
  ({ offset, value: dataLength } = uInt8(buffer, offset));

  switch (dataLength) {
    case 0:
      return new Result(offset, null);

    case 4:
      return readSmallDateTime(buffer, offset, useUTC);
    case 8:
      return readDateTime(buffer, offset, useUTC);

    default:
      throw new Error('Unsupported dataLength ' + dataLength + ' for DateTimeN');
  }
}

interface DateWithNanosecondsDelta extends Date {
  nanosecondsDelta: number;
}

function readTime(buffer: Buffer, offset: number, dataLength: number, scale: number, useUTC: boolean) {
  let value: any;

  switch (dataLength) {
    case 3:
      ({ offset, value } = uInt24LE(buffer, offset));
      break;
    case 4:
      ({ offset, value } = uInt32LE(buffer, offset));
      break;
    case 5:
      ({ offset, value } = uInt40LE(buffer, offset));
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

  return new Result(offset, date);
}

function readDate(buffer: Buffer, offset: number, useUTC: boolean) {
  let days;
  ({ offset, value: days } = uInt24LE(buffer, offset));

  if (useUTC) {
    return new Result(offset, new Date(Date.UTC(2000, 0, days - 730118)));
  } else {
    return new Result(offset, new Date(2000, 0, days - 730118));
  }
}

function readDateTime2(buffer: Buffer, offset: number, dataLength: number, scale: number, useUTC: boolean) {
  let time; // TODO: 'input' is 'time', but TypeScript cannot find "time.nanosecondsDelta";
  ({ offset, value: time } = readTime(buffer, offset, dataLength - 3, scale, useUTC));

  let days;
  ({ offset, value: days } = uInt24LE(buffer, offset));

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

  return new Result(offset, date);
}

function readDateTimeOffset(buffer: Buffer, offset: number, dataLength: number, scale: number) {
  let time;
  ({ offset, value: time } = readTime(buffer, offset, dataLength - 5, scale, true));

  let days;
  ({ offset, value: days } = uInt24LE(buffer, offset));

  // Skip tzOffset
  ({ offset } = int16LE(buffer, offset));

  const date = new Date(Date.UTC(2000, 0, days - 730118, 0, 0, 0, +time)) as DateWithNanosecondsDelta;

  Object.defineProperty(date, 'nanosecondsDelta', {
    enumerable: false,
    value: time.nanosecondsDelta
  });

  return new Result(offset, date);
}

export default valueParse;
module.exports = valueParse;
