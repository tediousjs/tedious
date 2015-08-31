import iconv from 'iconv-lite';
import { sprintf } from 'sprintf';
import * as guidParser from './guid-parser';
import { convertLEBytesToString } from './tracking-buffer/bigint';

const NULL = (1 << 16) - 1;
const MAX = (1 << 16) - 1;
const THREE_AND_A_THIRD = 3 + (1 / 3);
const MONEY_DIVISOR = 10000;
const PLP_NULL = new Buffer([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
const UNKNOWN_PLP_LEN = new Buffer([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
const DEFAULT_ENCODING = 'utf8';

export default function*(parser, metaData, options) {
  const type = metaData.type;
  let value, dataLength, textPointerNull;

  if (type.hasTextPointerAndTimestamp) {
    const textPointerLength = yield parser.readUInt8();

    if (textPointerLength !== 0) {
      // Appear to be dummy values, so consume and discard them.
      yield parser.readBuffer(textPointerLength);
      yield parser.readBuffer(8);
    } else {
      dataLength = 0;
      textPointerNull = true;
    }
  }

  if (dataLength !== 0) {
    // s2.2.4.2.1
    switch (type.id & 0x30) {
      case 0x10: // xx01xxxx - s2.2.4.2.1.1
        dataLength = 0;
        break;
      case 0x20: // xx10xxxx - s2.2.4.2.1.3
        // Variable length
        if (metaData.dataLength !== MAX) {
          switch (type.dataLengthLength) {
            case 0:
              dataLength = void 0;
              break;
            case 1:
              dataLength = yield parser.readUInt8();
              break;
            case 2:
              dataLength = yield parser.readUInt16LE();
              break;
            case 4:
              dataLength = yield parser.readUInt32LE();
              break;
            default:
              throw Error("Unsupported dataLengthLength " + type.dataLengthLength + " for data type " + type.name);
          }
        }
        break;
      case 0x30:
        dataLength = 1 << ((type.id & 0x0C) >> 2);
    }
  }

  switch (type.name) {
    case 'Null':
      value = null;
      break;

    case 'TinyInt':
      value = yield parser.readUInt8();
      break;

    case 'Int':
      value = yield parser.readInt32LE();
      break;

    case 'SmallInt':
      value = yield parser.readInt16LE();
      break;

    case 'BigInt':
      value = convertLEBytesToString(yield parser.readBuffer(8));
      break;

    case 'IntN':
      switch (dataLength) {
        case 0:
          value = null;
          break;
        case 1:
          value = yield parser.readUInt8();
          break;
        case 2:
          value = yield parser.readInt16LE();
          break;
        case 4:
          value = yield parser.readInt32LE();
          break;
        case 8:
          value = convertLEBytesToString(yield parser.readBuffer(8));
          break;
        default:
          throw new Error("Unsupported dataLength " + dataLength + " for IntN");
      }
      break;

    case 'Real':
      value = yield parser.readFloatLE();
      break;

    case 'Float':
      value = yield parser.readDoubleLE();
      break;

    case 'FloatN':
      switch (dataLength) {
        case 0:
          value = null;
          break;
        case 4:
          value = yield parser.readFloatLE();
          break;
        case 8:
          value = yield parser.readDoubleLE();
          break;
        default:
          throw new Error("Unsupported dataLength " + dataLength + " for FloatN");
      }
      break;

    case 'Money':
    case 'SmallMoney':
    case 'MoneyN':
      switch (dataLength) {
        case 0:
          value = null;
          break;
        case 4:
          value = (yield parser.readInt32LE()) / MONEY_DIVISOR;
          break;
        case 8:
          const high = yield parser.readInt32LE();
          const low = yield parser.readUInt32LE();
          value = low + (0x100000000 * high);
          value /= MONEY_DIVISOR;
          break;
        default:
          throw new Error("Unsupported dataLength " + dataLength + " for MoneyN");
      }
      break;

    case 'Bit':
      value = !!(yield parser.readUInt8());
      break;

    case 'BitN':
      switch (dataLength) {
        case 0:
          value = null;
          break;
        case 1:
          value = !!(yield parser.readUInt8());
      }
      break;

    case 'VarChar':
    case 'Char':
      const codepage = metaData.collation.codepage;
      if (metaData.dataLength === MAX) {
        value = yield* readMaxChars(parser, codepage);
      } else {
        value = yield* readChars(parser, dataLength, codepage);
      }
      break;

    case 'NVarChar':
    case 'NChar':
      if (metaData.dataLength === MAX) {
        value = yield* readMaxNChars(parser);
      } else {
        value = yield* readNChars(parser, dataLength);
      }
      break;

    case 'VarBinary':
    case 'Binary':
      if (metaData.dataLength === MAX) {
        value = yield* readMaxBinary(parser);
      } else {
        value = yield* readBinary(parser, dataLength);
      }
      break;

    case 'Text':
      if (textPointerNull) {
        value = null;
      } else {
        value = yield* readChars(parser, dataLength, metaData.collation.codepage);
      }
      break;

    case 'NText':
      if (textPointerNull) {
        value = null;
      } else {
        value = yield* readNChars(parser, dataLength);
      }
      break;

    case 'Image':
      if (textPointerNull) {
        value = null;
      } else {
        value = yield* readBinary(parser, dataLength);
      }
      break;

    case 'Xml':
      value = yield* readMaxNChars(parser);
      break;

    case 'SmallDateTime':
      value = yield* readSmallDateTime(parser, options.useUTC);
      break;

    case 'DateTime':
      value = yield* readDateTime(parser, options.useUTC);
      break;

    case 'DateTimeN':
      switch (dataLength) {
        case 0:
          value = null;
          break;
        case 4:
          value = yield* readSmallDateTime(parser, options.useUTC);
          break;
        case 8:
          value = yield* readDateTime(parser, options.useUTC);
      }
      break;

    case 'TimeN':
      if ((dataLength = yield parser.readUInt8()) === 0) {
        value = null;
      } else {
        value = yield* readTime(parser, dataLength, metaData.scale, options.useUTC);
      }
      break;

    case 'DateN':
      if ((dataLength = yield parser.readUInt8()) === 0) {
        value = null;
      } else {
        value = yield* readDate(parser, options.useUTC);
      }
      break;

    case 'DateTime2N':
      if ((dataLength = yield parser.readUInt8()) === 0) {
        value = null;
      } else {
        value = yield* readDateTime2(parser, dataLength, metaData.scale, options.useUTC);
      }
      break;

    case 'DateTimeOffsetN':
      if ((dataLength = yield parser.readUInt8()) === 0) {
        value = null;
      } else {
        value = yield* readDateTimeOffset(parser, dataLength, metaData.scale);
      }
      break;

    case 'NumericN':
    case 'DecimalN':
      if (dataLength === 0) {
        value = null;
      } else {
        const sign = (yield parser.readUInt8()) === 1 ? 1 : -1;
        switch (dataLength - 1) {
          case 4:
            value = yield parser.readUInt32LE();
            break;
          case 8:
            value = yield* parser.readUNumeric64LE();
            break;
          case 12:
            value = yield* parser.readUNumeric96LE();
            break;
          case 16:
            value = yield* parser.readUNumeric128LE();
            break;
          default:
            throw new Error(sprintf('Unsupported numeric size %d', dataLength - 1));
        }
        value *= sign;
        value /= Math.pow(10, metaData.scale);
      }
      break;

    case 'UniqueIdentifierN':
      switch (dataLength) {
        case 0:
          value = null;
          break;
        case 0x10:
          const data = new Buffer(yield parser.readBuffer(0x10));
          value = guidParser.arrayToGuid(data);
          break;
        default:
          throw new Error(sprintf('Unsupported guid size %d', dataLength - 1));
      }
      break;

    case 'UDT':
      value = yield* readMaxBinary(parser);
      break;

    default:
      throw new Error(sprintf('Unrecognised type %s', type.name));
  }

  return value;
}

function* readBinary(parser, dataLength) {
  if (dataLength === NULL) {
    return null;
  } else {
    return yield parser.readBuffer(dataLength);
  }
}

function* readChars(parser, dataLength, codepage) {
  if (codepage == null) {
    codepage = DEFAULT_ENCODING;
  }

  if (dataLength === NULL) {
    return null;
  } else {
    return iconv.decode(yield parser.readBuffer(dataLength), codepage);
  }
}

function* readNChars(parser, dataLength) {
  if (dataLength === NULL) {
    return null;
  } else {
    return (yield parser.readBuffer(dataLength)).toString("ucs2");
  }
}

function* readMaxBinary(parser) {
  return yield* readMax(parser);
}

function* readMaxChars(parser, codepage) {
  if (codepage == null) {
    codepage = DEFAULT_ENCODING;
  }

  let data;
  if ((data = yield* readMax(parser))) {
    return iconv.decode(data, codepage);
  } else {
    return null;
  }
}

function* readMaxNChars(parser) {
  return (yield* readMax(parser)).toString('ucs2');
}

function* readMax(parser) {
  const type = yield parser.readBuffer(8);

  if (type.equals(PLP_NULL)) {
    return null;
  } else if (type.equals(UNKNOWN_PLP_LEN)) {
    return yield* readMaxUnknownLength(parser);
  } else {
    const low = type.readUInt32LE(0);
    const high = type.readUInt32LE(4);
    if (high >= (2 << (53 - 32))) {
      console.warn("Read UInt64LE > 53 bits : high=" + high + ", low=" + low);
    }

    const expectedLength = low + (0x100000000 * high);
    return yield* readMaxKnownLength(parser, expectedLength);
  }
}

function* readMaxKnownLength(parser, totalLength) {
  const data = new Buffer(totalLength);

  let offset = 0, chunkLength;
  while ((chunkLength = yield parser.readUInt32LE())) {
    (yield parser.readBuffer(chunkLength)).copy(data, offset);
    offset += chunkLength;
  }

  if (offset !== totalLength) {
    throw new Error("Partially Length-prefixed Bytes unmatched lengths : expected " + totalLength + ", but got " + offset + " bytes");
  }

  return data;
}

function* readMaxUnknownLength(parser) {
  const chunks = [];
  let chunkLength, length = 0;

  while ((chunkLength = yield parser.readUInt32LE())) {
    length += chunkLength;
    chunks.push(yield parser.readBuffer(chunkLength));
  }

  return Buffer.concat(chunks, length);
}

function* readSmallDateTime(parser, useUTC) {
  const days = yield parser.readUInt16LE();
  const minutes = yield parser.readUInt16LE();

  let value;
  if (useUTC) {
    value = new Date(Date.UTC(1900, 0, 1));
    value.setUTCDate(value.getUTCDate() + days);
    value.setUTCMinutes(value.getUTCMinutes() + minutes);
  } else {
    value = new Date(1900, 0, 1);
    value.setDate(value.getDate() + days);
    value.setMinutes(value.getMinutes() + minutes);
  }
  return value;
}

function* readDateTime(parser, useUTC) {
  const days = yield parser.readInt32LE();
  const threeHundredthsOfSecond = yield parser.readUInt32LE();
  const milliseconds = threeHundredthsOfSecond * THREE_AND_A_THIRD;

  let value;
  if (useUTC) {
    value = new Date(Date.UTC(1900, 0, 1));
    value.setUTCDate(value.getUTCDate() + days);
    value.setUTCMilliseconds(value.getUTCMilliseconds() + milliseconds);
  } else {
    value = new Date(1900, 0, 1);
    value.setDate(value.getDate() + days);
    value.setMilliseconds(value.getMilliseconds() + milliseconds);
  }
  return value;
}

function* readTime(parser, dataLength, scale, useUTC) {
  let value;
  switch (dataLength) {
    case 3:
      value = yield* parser.readUInt24LE();
      break;
    case 4:
      value = yield parser.readUInt32LE();
      break;
    case 5:
      value = yield* parser.readUInt40LE();
  }

  if (scale < 7) {
    for (let i = scale; i < 7; i++) {
      value *= 10;
    }
  }

  let date;
  if (useUTC) {
    date = new Date(Date.UTC(1970, 0, 1, 0, 0, 0, value / 10000));
  } else {
    date = new Date(1970, 0, 1, 0, 0, 0, value / 10000);
  }
  Object.defineProperty(date, "nanosecondsDelta", {
    enumerable: false,
    value: (value % 10000) / Math.pow(10, 7)
  });
  return date;
}

function* readDate(parser, useUTC) {
  const days = yield* parser.readUInt24LE();
  if (useUTC) {
    return new Date(Date.UTC(2000, 0, days - 730118));
  } else {
    return new Date(2000, 0, days - 730118);
  }
}

function* readDateTime2(parser, dataLength, scale, useUTC) {
  const time = yield* readTime(parser, dataLength - 3, scale, useUTC);
  const days = yield* parser.readUInt24LE();

  let date;
  if (useUTC) {
    date = new Date(Date.UTC(2000, 0, days - 730118, 0, 0, 0, +time));
  } else {
    date = new Date(2000, 0, days - 730118, time.getHours(), time.getMinutes(), time.getSeconds(), time.getMilliseconds());
  }
  Object.defineProperty(date, "nanosecondsDelta", {
    enumerable: false,
    value: time.nanosecondsDelta
  });
  return date;
}

function* readDateTimeOffset(parser, dataLength, scale) {
  const time = yield* readTime(parser, dataLength - 5, scale, true);
  const days = yield* parser.readUInt24LE();
  yield parser.readInt16LE(); // offset
  const date = new Date(Date.UTC(2000, 0, days - 730118, 0, 0, 0, +time));
  Object.defineProperty(date, "nanosecondsDelta", {
    enumerable: false,
    value: time.nanosecondsDelta
  });
  return date;
}
