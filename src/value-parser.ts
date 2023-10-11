import Parser, { type ParserOptions } from './token/stream-parser';
import { type Metadata, readCollation, _readCollation } from './metadata-parser';
import { TYPE } from './data-type';

import iconv from 'iconv-lite';
import { sprintf } from 'sprintf-js';
import { bufferToLowerCaseGuid, bufferToUpperCaseGuid } from './guid-parser';
import type { BufferList } from 'bl/BufferList';
import { NotEnoughDataError, type Result, readBigInt64LE, readDoubleLE, readFloatLE, readInt16LE, readInt32LE, readUInt16LE, readUInt32LE, readUInt8, readUInt24LE, readUInt40LE, readUNumeric64LE, readUNumeric96LE, readUNumeric128LE } from './token/helpers';

const NULL = (1 << 16) - 1;
const MAX = (1 << 16) - 1;
const THREE_AND_A_THIRD = 3 + (1 / 3);
const MONEY_DIVISOR = 10000;
const PLP_NULL = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
const UNKNOWN_PLP_LEN = Buffer.from([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
const DEFAULT_ENCODING = 'utf8';

function readTinyInt(parser: Parser, callback: (value: unknown) => void) {
  parser.readUInt8(callback);
}

function _readTinyInt(buf: Buffer | BufferList, offset: number): Result<number> {
  return readUInt8(buf, offset);
}

function readSmallInt(parser: Parser, callback: (value: unknown) => void) {
  parser.readInt16LE(callback);
}

function _readSmallInt(buf: Buffer | BufferList, offset: number): Result<number> {
  return readInt16LE(buf, offset);
}

function readInt(parser: Parser, callback: (value: unknown) => void) {
  parser.readInt32LE(callback);
}

function _readInt(buf: Buffer | BufferList, offset: number): Result<number> {
  return readInt32LE(buf, offset);
}

function readBigInt(parser: Parser, callback: (value: unknown) => void) {
  parser.readBigInt64LE((value) => {
    callback(value.toString());
  });
}

function _readBigInt(buf: Buffer | BufferList, offset: number): Result<string> {
  let value;
  ({ offset, value } = readBigInt64LE(buf, offset));

  return { value: value.toString(), offset };
}

function _readReal(buf: Buffer | BufferList, offset: number): Result<number> {
  return readFloatLE(buf, offset);
}

function readReal(parser: Parser, callback: (value: unknown) => void) {
  parser.readFloatLE(callback);
}

function _readFloat(buf: Buffer | BufferList, offset: number): Result<number> {
  return readDoubleLE(buf, offset);
}

function readFloat(parser: Parser, callback: (value: unknown) => void) {
  parser.readDoubleLE(callback);
}

function readSmallMoney(parser: Parser, callback: (value: unknown) => void) {
  parser.readInt32LE((value) => {
    callback(value / MONEY_DIVISOR);
  });
}

function _readSmallMoney(buf: Buffer | BufferList, offset: number): Result<number> {
  let value;
  ({ offset, value } = readUInt32LE(buf, offset));
  return { value: value / MONEY_DIVISOR, offset };
}

function readMoney(parser: Parser, callback: (value: unknown) => void) {
  parser.readInt32LE((high) => {
    parser.readUInt32LE((low) => {
      callback((low + (0x100000000 * high)) / MONEY_DIVISOR);
    });
  });
}

function _readMoney(buf: Buffer | BufferList, offset: number): Result<number> {
  let high;
  ({ offset, value: high } = readUInt32LE(buf, offset));

  let low;
  ({ offset, value: low } = readUInt32LE(buf, offset));

  return { value: (low + (0x100000000 * high)) / MONEY_DIVISOR, offset };
}

function readBit(parser: Parser, callback: (value: unknown) => void) {
  parser.readUInt8((value) => {
    callback(!!value);
  });
}

function _readBit(buf: Buffer | BufferList, offset: number): Result<boolean> {
  let value;
  ({ offset, value } = readUInt8(buf, offset));

  return { value: !!value, offset };
}

function readValue(buf: Buffer | BufferList, offset: number, metadata: Metadata, options: ParserOptions): Result<unknown> {
  const type = metadata.type;

  switch (type.name) {
    case 'Null':
      return { value: null, offset };

    case 'TinyInt': {
      return _readTinyInt(buf, offset);
    }

    case 'SmallInt': {
      return _readSmallInt(buf, offset);
    }

    case 'Int': {
      return _readInt(buf, offset);
    }

    case 'BigInt': {
      return _readBigInt(buf, offset);
    }

    case 'IntN': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      switch (dataLength) {
        case 0:
          return { value: null, offset };

        case 1:
          return _readTinyInt(buf, offset);
        case 2:
          return _readSmallInt(buf, offset);
        case 4:
          return _readInt(buf, offset);
        case 8:
          return _readBigInt(buf, offset);

        default:
          throw new Error('Unsupported dataLength ' + dataLength + ' for IntN');
      }
    }

    case 'Real': {
      return _readReal(buf, offset);
    }

    case 'Float': {
      return _readFloat(buf, offset);
    }

    case 'FloatN': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      switch (dataLength) {
        case 0:
          return { value: null, offset };

        case 4:
          return _readReal(buf, offset);
        case 8:
          return _readFloat(buf, offset);

        default:
          throw new Error('Unsupported dataLength ' + dataLength + ' for FloatN');
      }
    }

    case 'SmallMoney': {
      return _readSmallMoney(buf, offset);
    }

    case 'Money':
      return _readMoney(buf, offset);

    case 'MoneyN': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      switch (dataLength) {
        case 0:
          return { value: null, offset };

        case 4:
          return _readSmallMoney(buf, offset);
        case 8:
          return _readMoney(buf, offset);

        default:
          throw new Error('Unsupported dataLength ' + dataLength + ' for MoneyN');
      }
    }

    case 'Bit': {
      return _readBit(buf, offset);
    }

    case 'BitN': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      switch (dataLength) {
        case 0:
          return { value: null, offset };

        case 1:
          return _readBit(buf, offset);

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
        return { value: null, offset };
      }

      // console.log(metadata, dataLength);

      return _readChars(buf, offset, dataLength, codepage);
    }

    case 'NVarChar':
    case 'NChar': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt16LE(buf, offset));

      if (dataLength === NULL) {
        return { value: null, offset };
      }

      return _readNChars(buf, offset, dataLength);
    }

    case 'VarBinary':
    case 'Binary': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt16LE(buf, offset));

      if (dataLength === NULL) {
        return { value: null, offset };
      }

      return _readBinary(buf, offset, dataLength);
    }

    case 'Text': {
      let textPointerLength;
      ({ offset, value: textPointerLength } = readUInt8(buf, offset));

      if (textPointerLength === 0) {
        return { value: null, offset };
      }

      // Textpointer
      ({ offset } = _readBinary(buf, offset, textPointerLength));

      // Timestamp
      ({ offset } = _readBinary(buf, offset, 8));

      let dataLength;
      ({ offset, value: dataLength } = readUInt32LE(buf, offset));

      return _readChars(buf, offset, dataLength, metadata.collation!.codepage!);
    }

    case 'NText': {
      let textPointerLength;
      ({ offset, value: textPointerLength } = readUInt8(buf, offset));

      if (textPointerLength === 0) {
        return { value: null, offset };
      }

      // Textpointer
      ({ offset } = _readBinary(buf, offset, textPointerLength));

      // Timestamp
      ({ offset } = _readBinary(buf, offset, 8));

      let dataLength;
      ({ offset, value: dataLength } = readUInt32LE(buf, offset));

      return _readNChars(buf, offset, dataLength);
    }

    case 'Image': {
      let textPointerLength;
      ({ offset, value: textPointerLength } = readUInt8(buf, offset));

      if (textPointerLength === 0) {
        return { value: null, offset };
      }

      // Textpointer
      ({ offset } = _readBinary(buf, offset, textPointerLength));

      // Timestamp
      ({ offset } = _readBinary(buf, offset, 8));

      let dataLength;
      ({ offset, value: dataLength } = readUInt32LE(buf, offset));

      return _readBinary(buf, offset, dataLength);
    }

    case 'SmallDateTime': {
      return _readSmallDateTime(buf, offset, options.useUTC);
    }

    case 'DateTime': {
      return _readDateTime(buf, offset, options.useUTC);
    }

    case 'DateTimeN': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      switch (dataLength) {
        case 0:
          return { value: null, offset };

        case 4:
          return _readSmallDateTime(buf, offset, options.useUTC);
        case 8:
          return _readDateTime(buf, offset, options.useUTC);

        default:
          throw new Error('Unsupported dataLength ' + dataLength + ' for DateTimeN');
      }
    }

    case 'Time': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      if (dataLength === 0) {
        return { value: null, offset };
      }

      return _readTime(buf, offset, dataLength, metadata.scale!, options.useUTC);
    }

    case 'Date': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      if (dataLength === 0) {
        return { value: null, offset };
      }

      return _readDate(buf, offset, options.useUTC);
    }

    case 'DateTime2': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      if (dataLength === 0) {
        return { value: null, offset };
      }

      return _readDateTime2(buf, offset, dataLength, metadata.scale!, options.useUTC);
    }

    case 'DateTimeOffset': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      if (dataLength === 0) {
        return { value: null, offset };
      }

      return _readDateTimeOffset(buf, offset, dataLength, metadata.scale!);
    }

    case 'NumericN':
    case 'DecimalN': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      if (dataLength === 0) {
        return { value: null, offset };
      }

      return _readNumeric(buf, offset, dataLength, metadata.precision!, metadata.scale!);
    }

    case 'UniqueIdentifier': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt8(buf, offset));

      switch (dataLength) {
        case 0:
          return { value: null, offset };

        case 0x10:
          return _readUniqueIdentifier(buf, offset, options);

        default:
          throw new Error(sprintf('Unsupported guid size %d', dataLength! - 1));
      }
    }

    case 'Variant': {
      let dataLength;
      ({ offset, value: dataLength } = readUInt32LE(buf, offset));

      if (dataLength === 0) {
        return { value: null, offset };
      }

      return _readVariant(buf, offset, options, dataLength);
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

function valueParse(parser: Parser, metadata: Metadata, options: ParserOptions, callback: (value: unknown) => void): void {
  const type = metadata.type;

  switch (type.name) {
    case 'Null':
      return callback(null);

    case 'TinyInt':
      return readTinyInt(parser, callback);

    case 'SmallInt':
      return readSmallInt(parser, callback);

    case 'Int':
      return readInt(parser, callback);

    case 'BigInt':
      return readBigInt(parser, callback);

    case 'IntN':
      return parser.readUInt8((dataLength) => {
        switch (dataLength) {
          case 0:
            return callback(null);

          case 1:
            return readTinyInt(parser, callback);
          case 2:
            return readSmallInt(parser, callback);
          case 4:
            return readInt(parser, callback);
          case 8:
            return readBigInt(parser, callback);

          default:
            throw new Error('Unsupported dataLength ' + dataLength + ' for IntN');
        }
      });

    case 'Real':
      return readReal(parser, callback);

    case 'Float':
      return readFloat(parser, callback);

    case 'FloatN':
      return parser.readUInt8((dataLength) => {
        switch (dataLength) {
          case 0:
            return callback(null);

          case 4:
            return readReal(parser, callback);
          case 8:
            return readFloat(parser, callback);

          default:
            throw new Error('Unsupported dataLength ' + dataLength + ' for FloatN');
        }
      });

    case 'SmallMoney':
      return readSmallMoney(parser, callback);

    case 'Money':
      return readMoney(parser, callback);

    case 'MoneyN':
      return parser.readUInt8((dataLength) => {
        switch (dataLength) {
          case 0:
            return callback(null);

          case 4:
            return readSmallMoney(parser, callback);
          case 8:
            return readMoney(parser, callback);

          default:
            throw new Error('Unsupported dataLength ' + dataLength + ' for MoneyN');
        }
      });

    case 'Bit':
      return readBit(parser, callback);

    case 'BitN':
      return parser.readUInt8((dataLength) => {
        switch (dataLength) {
          case 0:
            return callback(null);

          case 1:
            return readBit(parser, callback);

          default:
            throw new Error('Unsupported dataLength ' + dataLength + ' for BitN');
        }
      });

    case 'VarChar':
    case 'Char':
      const codepage = metadata.collation!.codepage!;
      if (metadata.dataLength === MAX) {
        return readMaxChars(parser, codepage, callback);
      } else {
        return parser.readUInt16LE((dataLength) => {
          if (dataLength === NULL) {
            return callback(null);
          }

          readChars(parser, dataLength!, codepage, callback);
        });
      }

    case 'NVarChar':
    case 'NChar':
      if (metadata.dataLength === MAX) {
        return readMaxNChars(parser, callback);
      } else {
        return parser.readUInt16LE((dataLength) => {
          if (dataLength === NULL) {
            return callback(null);
          }

          readNChars(parser, dataLength!, callback);
        });
      }

    case 'VarBinary':
    case 'Binary':
      if (metadata.dataLength === MAX) {
        return readMaxBinary(parser, callback);
      } else {
        return parser.readUInt16LE((dataLength) => {
          if (dataLength === NULL) {
            return callback(null);
          }

          readBinary(parser, dataLength!, callback);
        });
      }

    case 'Text':
      return parser.readUInt8((textPointerLength) => {
        if (textPointerLength === 0) {
          return callback(null);
        }

        parser.readBuffer(textPointerLength, (_textPointer) => {
          parser.readBuffer(8, (_timestamp) => {
            parser.readUInt32LE((dataLength) => {
              readChars(parser, dataLength!, metadata.collation!.codepage!, callback);
            });
          });
        });
      });

    case 'NText':
      return parser.readUInt8((textPointerLength) => {
        if (textPointerLength === 0) {
          return callback(null);
        }

        parser.readBuffer(textPointerLength, (_textPointer) => {
          parser.readBuffer(8, (_timestamp) => {
            parser.readUInt32LE((dataLength) => {
              readNChars(parser, dataLength!, callback);
            });
          });
        });
      });

    case 'Image':
      return parser.readUInt8((textPointerLength) => {
        if (textPointerLength === 0) {
          return callback(null);
        }

        parser.readBuffer(textPointerLength, (_textPointer) => {
          parser.readBuffer(8, (_timestamp) => {
            parser.readUInt32LE((dataLength) => {
              readBinary(parser, dataLength!, callback);
            });
          });
        });
      });

    case 'Xml':
      return readMaxNChars(parser, callback);

    case 'SmallDateTime':
      return readSmallDateTime(parser, options.useUTC, callback);

    case 'DateTime':
      return readDateTime(parser, options.useUTC, callback);

    case 'DateTimeN':
      return parser.readUInt8((dataLength) => {
        switch (dataLength) {
          case 0:
            return callback(null);

          case 4:
            return readSmallDateTime(parser, options.useUTC, callback);
          case 8:
            return readDateTime(parser, options.useUTC, callback);

          default:
            throw new Error('Unsupported dataLength ' + dataLength + ' for DateTimeN');
        }
      });

    case 'Time':
      return parser.readUInt8((dataLength) => {
        if (dataLength === 0) {
          return callback(null);
        } else {
          return readTime(parser, dataLength!, metadata.scale!, options.useUTC, callback);
        }
      });

    case 'Date':
      return parser.readUInt8((dataLength) => {
        if (dataLength === 0) {
          return callback(null);
        } else {
          return readDate(parser, options.useUTC, callback);
        }
      });

    case 'DateTime2':
      return parser.readUInt8((dataLength) => {
        if (dataLength === 0) {
          return callback(null);
        } else {
          return readDateTime2(parser, dataLength!, metadata.scale!, options.useUTC, callback);
        }
      });

    case 'DateTimeOffset':
      return parser.readUInt8((dataLength) => {
        if (dataLength === 0) {
          return callback(null);
        } else {
          return readDateTimeOffset(parser, dataLength!, metadata.scale!, callback);
        }
      });

    case 'NumericN':
    case 'DecimalN':
      return parser.readUInt8((dataLength) => {
        if (dataLength === 0) {
          return callback(null);
        } else {
          return readNumeric(parser, dataLength!, metadata.precision!, metadata.scale!, callback);
        }
      });

    case 'UniqueIdentifier':
      return parser.readUInt8((dataLength) => {
        switch (dataLength) {
          case 0:
            return callback(null);

          case 0x10:
            return readUniqueIdentifier(parser, options, callback);

          default:
            throw new Error(sprintf('Unsupported guid size %d', dataLength! - 1));
        }
      });

    case 'UDT':
      return readMaxBinary(parser, callback);

    case 'Variant':
      return parser.readUInt32LE((dataLength) => {
        if (dataLength === 0) {
          return callback(null);
        }

        readVariant(parser, options, dataLength!, callback);
      });

    default:
      throw new Error(sprintf('Unrecognised type %s', type.name));
  }
}

function _readUniqueIdentifier(buf: Buffer | BufferList, offset: number, options: ParserOptions): Result<string> {
  let data;
  ({ value: data, offset } = _readBinary(buf, offset, 0x10));

  return { value: options.lowerCaseGuids ? bufferToLowerCaseGuid(data) : bufferToUpperCaseGuid(data), offset };
}

function readUniqueIdentifier(parser: Parser, options: ParserOptions, callback: (value: unknown) => void) {
  parser.readBuffer(0x10, (data) => {
    callback(options.lowerCaseGuids ? bufferToLowerCaseGuid(data) : bufferToUpperCaseGuid(data));
  });
}

function _readNumeric(buf: Buffer | BufferList, offset: number, dataLength: number, _precision: number, scale: number): Result<number> {
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

  return { value: (value * sign) / Math.pow(10, scale), offset };
}

function readNumeric(parser: Parser, dataLength: number, _precision: number, scale: number, callback: (value: unknown) => void) {
  parser.readUInt8((sign) => {
    sign = sign === 1 ? 1 : -1;

    let readValue;
    if (dataLength === 5) {
      readValue = parser.readUInt32LE;
    } else if (dataLength === 9) {
      readValue = parser.readUNumeric64LE;
    } else if (dataLength === 13) {
      readValue = parser.readUNumeric96LE;
    } else if (dataLength === 17) {
      readValue = parser.readUNumeric128LE;
    } else {
      throw new Error(sprintf('Unsupported numeric dataLength %d', dataLength));
    }

    readValue.call(parser, (value) => {
      callback((value * sign) / Math.pow(10, scale));
    });
  });
}

function _readVariant(buf: Buffer | BufferList, offset: number, options: ParserOptions, dataLength: number): Result<unknown> {
  let baseType;
  ({ value: baseType, offset } = readUInt8(buf, offset));

  const type = TYPE[baseType];

  let propBytes;
  ({ value: propBytes, offset } = readUInt8(buf, offset));

  dataLength = dataLength - propBytes - 2;

  switch (type.name) {
    case 'UniqueIdentifier':
      return _readUniqueIdentifier(buf, offset, options);

    case 'Bit':
      return _readBit(buf, offset);

    case 'TinyInt':
      return _readTinyInt(buf, offset);

    case 'SmallInt':
      return _readSmallInt(buf, offset);

    case 'Int':
      return _readInt(buf, offset);

    case 'BigInt':
      return _readBigInt(buf, offset);

    case 'SmallDateTime':
      return _readSmallDateTime(buf, offset, options.useUTC);

    case 'DateTime':
      return _readDateTime(buf, offset, options.useUTC);

    case 'Real':
      return _readReal(buf, offset);

    case 'Float':
      return _readFloat(buf, offset);

    case 'SmallMoney':
      return _readSmallMoney(buf, offset);

    case 'Money':
      return _readMoney(buf, offset);

    case 'Date':
      return _readDate(buf, offset, options.useUTC);

    case 'Time': {
      let scale;
      ({ value: scale, offset } = readUInt8(buf, offset));

      return _readTime(buf, offset, dataLength, scale, options.useUTC);
    }

    case 'DateTime2': {
      let scale;
      ({ value: scale, offset } = readUInt8(buf, offset));

      return _readDateTime2(buf, offset, dataLength, scale, options.useUTC);
    }

    case 'DateTimeOffset': {
      let scale;
      ({ value: scale, offset } = readUInt8(buf, offset));

      return _readDateTimeOffset(buf, offset, dataLength, scale);
    }

    case 'VarBinary':
    case 'Binary': {
      // maxLength (unused?)
      ({ offset } = readUInt16LE(buf, offset));

      return _readBinary(buf, offset, dataLength);
    }

    case 'NumericN':
    case 'DecimalN': {
      let precision;
      ({ value: precision, offset } = readUInt8(buf, offset));

      let scale;
      ({ value: scale, offset } = readUInt8(buf, offset));

      return _readNumeric(buf, offset, dataLength, precision, scale);
    }

    case 'VarChar':
    case 'Char': {
      // maxLength (unused?)
      ({ offset } = readUInt16LE(buf, offset));

      let collation;
      ({ value: collation, offset } = _readCollation(buf, offset));

      return _readChars(buf, offset, dataLength, collation.codepage!);
    }

    case 'NVarChar':
    case 'NChar': {
      // maxLength (unused?)
      ({ offset } = readUInt16LE(buf, offset));

      // collation (unsued?)
      ({ offset } = _readCollation(buf, offset));

      return _readNChars(buf, offset, dataLength);
    }

    default:
      throw new Error('Invalid type!');
  }
}

function readVariant(parser: Parser, options: ParserOptions, dataLength: number, callback: (value: unknown) => void) {
  return parser.readUInt8((baseType) => {
    const type = TYPE[baseType];

    return parser.readUInt8((propBytes) => {
      dataLength = dataLength - propBytes - 2;

      switch (type.name) {
        case 'UniqueIdentifier':
          return readUniqueIdentifier(parser, options, callback);

        case 'Bit':
          return readBit(parser, callback);

        case 'TinyInt':
          return readTinyInt(parser, callback);

        case 'SmallInt':
          return readSmallInt(parser, callback);

        case 'Int':
          return readInt(parser, callback);

        case 'BigInt':
          return readBigInt(parser, callback);

        case 'SmallDateTime':
          return readSmallDateTime(parser, options.useUTC, callback);

        case 'DateTime':
          return readDateTime(parser, options.useUTC, callback);

        case 'Real':
          return readReal(parser, callback);

        case 'Float':
          return readFloat(parser, callback);

        case 'SmallMoney':
          return readSmallMoney(parser, callback);

        case 'Money':
          return readMoney(parser, callback);

        case 'Date':
          return readDate(parser, options.useUTC, callback);

        case 'Time':
          return parser.readUInt8((scale) => {
            return readTime(parser, dataLength, scale, options.useUTC, callback);
          });

        case 'DateTime2':
          return parser.readUInt8((scale) => {
            return readDateTime2(parser, dataLength, scale, options.useUTC, callback);
          });

        case 'DateTimeOffset':
          return parser.readUInt8((scale) => {
            return readDateTimeOffset(parser, dataLength, scale, callback);
          });

        case 'VarBinary':
        case 'Binary':
          return parser.readUInt16LE((_maxLength) => {
            readBinary(parser, dataLength, callback);
          });

        case 'NumericN':
        case 'DecimalN':
          return parser.readUInt8((precision) => {
            parser.readUInt8((scale) => {
              readNumeric(parser, dataLength, precision, scale, callback);
            });
          });

        case 'VarChar':
        case 'Char':
          return parser.readUInt16LE((_maxLength) => {
            readCollation(parser, (collation) => {
              readChars(parser, dataLength, collation.codepage!, callback);
            });
          });

        case 'NVarChar':
        case 'NChar':
          return parser.readUInt16LE((_maxLength) => {
            readCollation(parser, (_collation) => {
              readNChars(parser, dataLength, callback);
            });
          });

        default:
          throw new Error('Invalid type!');
      }
    });
  });
}

function _readBinary(buf: Buffer | BufferList, offset: number, dataLength: number): Result<Buffer> {
  if (buf.length < offset + dataLength) {
    throw new NotEnoughDataError(offset + dataLength);
  }

  return { value: buf.slice(offset, offset + dataLength), offset: offset + dataLength };
}

function readBinary(parser: Parser, dataLength: number, callback: (value: unknown) => void) {
  return parser.readBuffer(dataLength, callback);
}

function _readChars(buf: Buffer | BufferList, offset: number, dataLength: number, codepage: string): Result<string> {
  if (buf.length < offset + dataLength) {
    throw new NotEnoughDataError(offset + dataLength);
  }

  return { value: iconv.decode(buf.slice(offset, offset + dataLength), codepage ?? DEFAULT_ENCODING), offset: offset + dataLength };
}

function readChars(parser: Parser, dataLength: number, codepage: string, callback: (value: unknown) => void) {
  if (codepage == null) {
    codepage = DEFAULT_ENCODING;
  }

  return parser.readBuffer(dataLength, (data) => {
    callback(iconv.decode(data, codepage));
  });
}

function _readNChars(buf: Buffer | BufferList, offset: number, dataLength: number): Result<string> {
  if (buf.length < offset + dataLength) {
    throw new NotEnoughDataError(offset + dataLength);
  }

  return { value: buf.toString('ucs2', offset, offset + dataLength), offset: offset + dataLength };
}

function readNChars(parser: Parser, dataLength: number, callback: (value: unknown) => void) {
  parser.readBuffer(dataLength, (data) => {
    callback(data.toString('ucs2'));
  });
}

function readMaxBinary(parser: Parser, callback: (value: unknown) => void) {
  return readMax(parser, callback);
}

function readMaxChars(parser: Parser, codepage: string, callback: (value: unknown) => void) {
  if (codepage == null) {
    codepage = DEFAULT_ENCODING;
  }

  readMax(parser, (data) => {
    if (data) {
      callback(iconv.decode(data, codepage));
    } else {
      callback(null);
    }
  });
}

function readMaxNChars(parser: Parser, callback: (value: string | null) => void) {
  readMax(parser, (data) => {
    if (data) {
      callback(data.toString('ucs2'));
    } else {
      callback(null);
    }
  });
}

async function readPLPStream(parser: Parser): Promise<null | Buffer[]> {
  while (parser.buffer.length < parser.position + 8) {
    await parser.waitForChunk();
  }

  const type = parser.buffer.slice(parser.position, parser.position + 8);
  parser.position += 8;

  if (type.equals(PLP_NULL)) {
    return null;
  }

  const chunks: Buffer[] = [];

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
  }

  // if (!type.equals(UNKNOWN_PLP_LEN)) {
  //   const low = type.readUInt32LE(0);
  //   const high = type.readUInt32LE(4);

  //   if (high >= (2 << (53 - 32))) {
  //     console.warn('Read UInt64LE > 53 bits : high=' + high + ', low=' + low);
  //   }

  //   const expectedLength = low + (0x100000000 * high);
  // }

  return chunks;
}

function readMax(parser: Parser, callback: (value: null | Buffer) => void) {
  parser.readBuffer(8, (type) => {
    if (type.equals(PLP_NULL)) {
      return callback(null);
    } else if (type.equals(UNKNOWN_PLP_LEN)) {
      return readMaxUnknownLength(parser, callback);
    } else {
      const low = type.readUInt32LE(0);
      const high = type.readUInt32LE(4);

      if (high >= (2 << (53 - 32))) {
        console.warn('Read UInt64LE > 53 bits : high=' + high + ', low=' + low);
      }

      const expectedLength = low + (0x100000000 * high);
      return readMaxKnownLength(parser, expectedLength, callback);
    }
  });
}

function readMaxKnownLength(parser: Parser, totalLength: number, callback: (value: null | Buffer) => void) {
  const data = Buffer.alloc(totalLength, 0);

  let offset = 0;
  function next(done: any) {
    parser.readUInt32LE((chunkLength) => {
      if (!chunkLength) {
        return done();
      }

      parser.readBuffer(chunkLength, (chunk) => {
        chunk.copy(data, offset);
        offset += chunkLength;

        next(done);
      });
    });
  }

  next(() => {
    if (offset !== totalLength) {
      throw new Error('Partially Length-prefixed Bytes unmatched lengths : expected ' + totalLength + ', but got ' + offset + ' bytes');
    }

    callback(data);
  });
}

function readMaxUnknownLength(parser: Parser, callback: (value: null | Buffer) => void) {
  const chunks: Buffer[] = [];

  let length = 0;
  function next(done: any) {
    parser.readUInt32LE((chunkLength) => {
      if (!chunkLength) {
        return done();
      }

      parser.readBuffer(chunkLength, (chunk) => {
        chunks.push(chunk);
        length += chunkLength;

        next(done);
      });
    });
  }

  next(() => {
    callback(Buffer.concat(chunks, length));
  });
}

function _readSmallDateTime(buf: Buffer | BufferList, offset: number, useUTC: boolean): Result<Date> {
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

  return { value, offset };
}

function readSmallDateTime(parser: Parser, useUTC: boolean, callback: (value: Date) => void) {
  parser.readUInt16LE((days) => {
    parser.readUInt16LE((minutes) => {
      let value;
      if (useUTC) {
        value = new Date(Date.UTC(1900, 0, 1 + days, 0, minutes));
      } else {
        value = new Date(1900, 0, 1 + days, 0, minutes);
      }
      callback(value);
    });
  });
}

function _readDateTime(buf: Buffer | BufferList, offset: number, useUTC: boolean): Result<Date> {
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

  return { value, offset };
}

function readDateTime(parser: Parser, useUTC: boolean, callback: (value: Date) => void) {
  parser.readInt32LE((days) => {
    parser.readUInt32LE((threeHundredthsOfSecond) => {
      const milliseconds = Math.round(threeHundredthsOfSecond * THREE_AND_A_THIRD);

      let value;
      if (useUTC) {
        value = new Date(Date.UTC(1900, 0, 1 + days, 0, 0, 0, milliseconds));
      } else {
        value = new Date(1900, 0, 1 + days, 0, 0, 0, milliseconds);
      }

      callback(value);
    });
  });
}

interface DateWithNanosecondsDelta extends Date {
  nanosecondsDelta: number;
}

function _readTime(buf: Buffer | BufferList, offset: number, dataLength: number, scale: number, useUTC: boolean): Result<DateWithNanosecondsDelta> {
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

  return { value: date, offset };
}

function readTime(parser: Parser, dataLength: number, scale: number, useUTC: boolean, callback: (value: DateWithNanosecondsDelta) => void) {
  let readValue: any;
  switch (dataLength) {
    case 3:
      readValue = parser.readUInt24LE;
      break;
    case 4:
      readValue = parser.readUInt32LE;
      break;
    case 5:
      readValue = parser.readUInt40LE;
  }

  readValue!.call(parser, (value: number) => {
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
    callback(date);
  });
}

function _readDate(buf: Buffer | BufferList, offset: number, useUTC: boolean): Result<Date> {
  let days;
  ({ offset, value: days } = readUInt24LE(buf, offset));

  if (useUTC) {
    return { value: new Date(Date.UTC(2000, 0, days - 730118)), offset };
  } else {
    return { value: new Date(2000, 0, days - 730118), offset };
  }
}

function readDate(parser: Parser, useUTC: boolean, callback: (value: Date) => void) {
  parser.readUInt24LE((days) => {
    if (useUTC) {
      callback(new Date(Date.UTC(2000, 0, days - 730118)));
    } else {
      callback(new Date(2000, 0, days - 730118));
    }
  });
}


function _readDateTime2(buf: Buffer | BufferList, offset: number, dataLength: number, scale: number, useUTC: boolean): Result<DateWithNanosecondsDelta> {
  let time;
  ({ offset, value: time } = _readTime(buf, offset, dataLength - 3, scale, useUTC));

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

  return { value: date, offset };
}

function readDateTime2(parser: Parser, dataLength: number, scale: number, useUTC: boolean, callback: (value: DateWithNanosecondsDelta) => void) {
  readTime(parser, dataLength - 3, scale, useUTC, (time) => { // TODO: 'input' is 'time', but TypeScript cannot find "time.nanosecondsDelta";
    parser.readUInt24LE((days) => {
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
      callback(date);
    });
  });
}

function _readDateTimeOffset(buf: Buffer | BufferList, offset: number, dataLength: number, scale: number): Result<DateWithNanosecondsDelta> {
  let time;
  ({ offset, value: time } = _readTime(buf, offset, dataLength - 5, scale, true));

  let days;
  ({ offset, value: days } = readUInt24LE(buf, offset));

  // time offset?
  ({ offset } = readUInt16LE(buf, offset));

  const date = new Date(Date.UTC(2000, 0, days - 730118, 0, 0, 0, +time)) as DateWithNanosecondsDelta;
  Object.defineProperty(date, 'nanosecondsDelta', {
    enumerable: false,
    value: time.nanosecondsDelta
  });
  return { value: date, offset };
}

function readDateTimeOffset(parser: Parser, dataLength: number, scale: number, callback: (value: DateWithNanosecondsDelta) => void) {
  readTime(parser, dataLength - 5, scale, true, (time) => {
    parser.readUInt24LE((days) => {
      // offset
      parser.readInt16LE(() => {
        const date = new Date(Date.UTC(2000, 0, days - 730118, 0, 0, 0, +time)) as DateWithNanosecondsDelta;
        Object.defineProperty(date, 'nanosecondsDelta', {
          enumerable: false,
          value: time.nanosecondsDelta
        });
        callback(date);
      });
    });
  });
}

export default valueParse;
module.exports = valueParse;
module.exports.readValue = readValue;
module.exports.isPLPStream = isPLPStream;
module.exports.readPLPStream = readPLPStream;

export { readValue, isPLPStream, readPLPStream };
