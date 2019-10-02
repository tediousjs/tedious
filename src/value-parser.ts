import Parser from './token/stream-parser';
import { MetaData, ValueMetaData, readPrecision, readScale, readCollation } from './metadata-parser';
import { InternalConnectionOptions } from './connection';
import {TYPE, DataType, DataTypeN } from './data-type';

const iconv  = require('iconv-lite');
const sprintf = require('sprintf-js').sprintf;
const guidParser = require('./guid-parser');

const convertLEBytesToString = require('./tracking-buffer/bigint').convertLEBytesToString;

const NULL = (1 << 16) - 1;
const MAX = (1 << 16) - 1;
const THREE_AND_A_THIRD = 3 + (1 / 3);
const MONEY_DIVISOR = 10000;
const PLP_NULL = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
const UNKNOWN_PLP_LEN = Buffer.from([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
const DEFAULT_ENCODING = 'utf8';

function readTextPointerNull(parser: Parser, type: DataType | DataTypeN , callback: (value: boolean) => void) {
  parser.readUInt8((textPointerLength) => {
    if (textPointerLength !== 0) {
      // Appear to be dummy values, so consume and discard them.
      parser.readBuffer(textPointerLength, () => {
        parser.readBuffer(8, () => {
          callback(false);
        });
      });
    } else {
      callback(true);
    }
  });
}

function readDataLength(parser: Parser, type: DataType | DataTypeN, metaData: MetaData, callback: (value: number | undefined) => void) {
  if (metaData.isVariantValue) {
    return callback(metaData.dataLength);
  }

  // s2.2.4.2.1
  switch (type.id & 0x30) {
    case 0x10: // xx01xxxx - s2.2.4.2.1.1
      return callback(0);

    case 0x20: // xx10xxxx - s2.2.4.2.1.3
      // Variable length
      if (metaData.dataLength !== MAX) {
        switch (type.dataLengthLength) {
          case 0:
            return callback(undefined);

          case 1:
            return parser.readUInt8(callback);

          case 2:
            return parser.readUInt16LE(callback);

          case 4:
            return parser.readUInt32LE(callback);

          default:
            return parser.emit('error', new Error('Unsupported dataLengthLength ' + type.dataLengthLength + ' for data type ' + type.name));
        }
      } else {
        return callback(undefined);
      }

    case 0x30:
      return callback(1 << ((type.id & 0x0C) >> 2));
  }
}

function valueParse(parser: Parser, metaData: MetaData, options: InternalConnectionOptions, callback: (value: unknown) => void): void {
  const type = metaData.type;

  switch (type.name) {
    case 'Null':
      return callback(null);

    case 'TinyInt':
      return parser.readUInt8(callback);

    case 'Int':
      return parser.readInt32LE(callback);

    case 'SmallInt':
      return parser.readInt16LE(callback);

    case 'BigInt':
      return parser.readBuffer(8, (buffer) => {
        callback(convertLEBytesToString(buffer));
      });

    case 'IntN':
      return readDataLength(parser, type, metaData, (dataLength) => {
        switch (dataLength) {
          case 0:
            return callback(null);
          case 1:
            return parser.readUInt8(callback);
          case 2:
            return parser.readInt16LE(callback);
          case 4:
            return parser.readInt32LE(callback);
          case 8:
            return parser.readBuffer(8, (buffer) => {
              callback(convertLEBytesToString(buffer));
            });

          default:
            return parser.emit('error', new Error('Unsupported dataLength ' + dataLength + ' for IntN'));
        }
      });

    case 'Real':
      return parser.readFloatLE(callback);

    case 'Float':
      return parser.readDoubleLE(callback);

    case 'FloatN':
      return readDataLength(parser, type, metaData, (dataLength) => {
        switch (dataLength) {
          case 0:
            return callback(null);
          case 4:
            return parser.readFloatLE(callback);
          case 8:
            return parser.readDoubleLE(callback);

          default:
            return parser.emit('error', new Error('Unsupported dataLength ' + dataLength + ' for FloatN'));
        }
      });

    case 'Money':
    case 'SmallMoney':
    case 'MoneyN':
      return readDataLength(parser, type, metaData, (dataLength) => {
        switch (dataLength) {
          case 0:
            return callback(null);
          case 4:
            return parser.readInt32LE((value) => {
              callback(value / MONEY_DIVISOR);
            });
          case 8:
            return parser.readInt32LE((high) => {
              parser.readUInt32LE((low) => {
                callback((low + (0x100000000 * high)) / MONEY_DIVISOR);
              });
            });

          default:
            return parser.emit('error', new Error('Unsupported dataLength ' + dataLength + ' for MoneyN'));
        }
      });

    case 'Bit':
      return parser.readUInt8((value) => {
        callback(!!value);
      });

    case 'BitN':
      return readDataLength(parser, type, metaData, (dataLength) => {
        switch (dataLength) {
          case 0:
            return callback(null);
          case 1:
            return parser.readUInt8((value) => {
              callback(!!value);
            });
          default:
            return parser.emit('error', new Error('Unsupported dataLength ' + dataLength + ' for BitN'));
        }
      });

    case 'VarChar':
    case 'Char':
      const codepage = metaData.collation!.codepage;
      if (metaData.dataLength === MAX) {
        return readMaxChars(parser, codepage, callback);
      } else {
        return readDataLength(parser, type, metaData, (dataLength) => {
          readChars(parser, dataLength!, codepage, NULL, callback);
        });
      }

    case 'NVarChar':
    case 'NChar':
      if (metaData.dataLength === MAX) {
        return readMaxNChars(parser, callback);
      } else {
        return readDataLength(parser, type, metaData, (dataLength) => {
          readNChars(parser, dataLength!, NULL, callback);
        });
      }

    case 'VarBinary':
    case 'Binary':
      if (metaData.dataLength === MAX) {
        return readMaxBinary(parser, callback);
      } else {
        return readDataLength(parser, type, metaData, (dataLength) => {
          readBinary(parser, dataLength!, NULL, callback);
        });
      }

    case 'Text':
      return readTextPointerNull(parser, type, (textPointerNull) => {
        if (textPointerNull) {
          return callback(null);
        }

        readDataLength(parser, type, metaData, (dataLength) => {
          readChars(parser, dataLength!, metaData.collation!.codepage, PLP_NULL, callback);
        });
      });

    case 'NText':
      return readTextPointerNull(parser, type, (textPointerNull) => {
        if (textPointerNull) {
          return callback(null);
        }

        readDataLength(parser, type, metaData, (dataLength) => {
          readNChars(parser, dataLength!, PLP_NULL, callback);
        });
      });

    case 'Image':
      return readTextPointerNull(parser, type, (textPointerNull) => {
        if (textPointerNull) {
          return callback(null);
        }

        readDataLength(parser, type, metaData, (dataLength) => {
          readBinary(parser, dataLength!, PLP_NULL, callback);
        });
      });

    case 'Xml':
      return readDataLength(parser, type, metaData, (dataLength) => {
        readMaxNChars(parser, callback);
      });

    case 'SmallDateTime':
      return readSmallDateTime(parser, options.useUTC, callback);

    case 'DateTime':
      return readDateTime(parser, options.useUTC, callback);

    case 'DateTimeN':
      return readDataLength(parser, type, metaData, (dataLength) => {
        switch (dataLength) {
          case 0:
            return callback(null);
          case 4:
            return readSmallDateTime(parser, options.useUTC, callback);
          case 8:
            return readDateTime(parser, options.useUTC, callback);
          default:
            return parser.emit('error', new Error('Unsupported dataLength ' + dataLength + ' for DateTimeN'));
        }
      });

    case 'Time':
      return readDataLength(parser, type, metaData, (dataLength) => {
        if (dataLength === 0) {
          return callback(null);
        } else {
          return readTime(parser, dataLength!, metaData.scale!, options.useUTC, callback);
        }
      });

    case 'Date':
      return readDataLength(parser, type, metaData, (dataLength) => {
        if (dataLength === 0) {
          return callback(null);
        } else {
          return readDate(parser, options.useUTC, callback);
        }
      });

    case 'DateTime2':
      return readDataLength(parser, type, metaData, (dataLength) => {
        if (dataLength === 0) {
          return callback(null);
        } else {
          return readDateTime2(parser, dataLength!, metaData.scale!, options.useUTC, callback);
        }
      });

    case 'DateTimeOffset':
      return readDataLength(parser, type, metaData, (dataLength) => {
        if (dataLength === 0) {
          return callback(null);
        } else {
          return readDateTimeOffset(parser, dataLength!, metaData.scale!, callback);
        }
      });

    case 'NumericN':
    case 'DecimalN':
      return readDataLength(parser, type, metaData, (dataLength) => {
        if (dataLength === 0) {
          return callback(null);
        } else {
          return parser.readUInt8((sign) => {
            sign = sign === 1 ? 1 : -1;

            let readValue;
            switch (dataLength! - 1) {
              case 4:
                readValue = parser.readUInt32LE;
                break;
              case 8:
                readValue = parser.readUNumeric64LE;
                break;
              case 12:
                readValue = parser.readUNumeric96LE;
                break;
              case 16:
                readValue = parser.readUNumeric128LE;
                break;
              default:
                return parser.emit('error', new Error(sprintf('Unsupported numeric size %d', dataLength! - 1)));
            }

            readValue.call(parser, (value) => {
              callback((value * sign) / Math.pow(10, metaData.scale!));
            });
          });
        }
      });

    case 'UniqueIdentifier':
      return readDataLength(parser, type, metaData, (dataLength) => {
        switch (dataLength) {
          case 0:
            return callback(null);
          case 0x10:
            return parser.readBuffer(0x10, (data) => {
              callback(options.lowerCaseGuids ? guidParser.arrayToLowerCaseGuid(data) : guidParser.arrayToUpperCaseGuid(data));
            });

          default:
            return parser.emit('error', new Error(sprintf('Unsupported guid size %d', dataLength! - 1)));
        }
      });

    case 'UDT':
      return readDataLength(parser, type, metaData, (dataLength) => {
        readMaxBinary(parser, callback);
      });

    case 'Variant':
      return readDataLength(parser, type, metaData, (dataLength) => {
        if (dataLength === 0) {
          return callback(null);
        }

        const valueMetaData = metaData.valueMetaData = { } as ValueMetaData;

        Object.defineProperty(valueMetaData, 'isVariantValue', { value: true });
        return parser.readUInt8((baseType) => {
          return parser.readUInt8((propBytes) => {
            valueMetaData.dataLength = dataLength! - propBytes - 2;
            valueMetaData.type = TYPE[baseType];
            return readPrecision(parser, valueMetaData.type, (precision) => {
              valueMetaData.precision = precision;
              return readScale(parser, valueMetaData.type, (scale) => {
                valueMetaData.scale = scale;
                return readCollation(parser, valueMetaData.type, (collation) => {
                  valueMetaData.collation = collation;
                  if (baseType === 0xA5 || baseType === 0xAD || baseType === 0xA7 || baseType === 0xAF || baseType === 0xE7 || baseType === 0xEF) {
                    return readDataLength(parser, valueMetaData.type, {} as MetaData, (maxDataLength) => {
                      // skip the 2-byte max length sent for BIGVARCHRTYPE, BIGCHARTYPE, NVARCHARTYPE, NCHARTYPE, BIGVARBINTYPE and BIGBINARYTYPE types
                      // and parse based on the length of actual data
                      return valueParse(parser, valueMetaData as MetaData, options, callback);
                    });
                  } else {
                    return valueParse(parser, valueMetaData as MetaData, options, callback);
                  }
                });
              });
            });
          });
        });
      });

    default:
      return parser.emit('error', new Error(sprintf('Unrecognised type %s', type.name)));
  }
}

function readBinary(parser: Parser, dataLength: number, nullValue: number | Buffer | undefined, callback: (value: unknown) => void) {
  if (dataLength === nullValue) {
    return callback(null);
  } else {
    return parser.readBuffer(dataLength, callback);
  }
}

function readChars(parser: Parser, dataLength: number, codepage: string, nullValue: number | Buffer | undefined, callback: (value: unknown) => void) {
  if (codepage == null) {
    codepage = DEFAULT_ENCODING;
  }

  if (dataLength === nullValue) {
    return callback(null);
  } else {
    return parser.readBuffer(dataLength, (data) => {
      callback(iconv.decode(data, codepage));
    });
  }
}

function readNChars(parser: Parser, dataLength: number, nullValue: number | Buffer | undefined, callback: (value: unknown) => void) {
  if (dataLength === nullValue) {
    return callback(null);
  } else {
    return parser.readBuffer(dataLength, (data) => {
      callback(data.toString('ucs2'));
    });
  }
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
      parser.emit('error', new Error('Partially Length-prefixed Bytes unmatched lengths : expected ' + totalLength + ', but got ' + offset + ' bytes'));
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

function readTime(parser: Parser, dataLength: number, scale: number, useUTC: boolean, callback: (value: Date) => void) {
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
      date = new Date(Date.UTC(1970, 0, 1, 0, 0, 0, value / 10000));
    } else {
      date = new Date(1970, 0, 1, 0, 0, 0, value / 10000);
    }
    Object.defineProperty(date, 'nanosecondsDelta', {
      enumerable: false,
      value: (value % 10000) / Math.pow(10, 7)
    });
    callback(date);
  });
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

function readDateTime2(parser: Parser, dataLength: number, scale: number, useUTC: boolean, callback: (value: Date) => void) {
  readTime(parser, dataLength - 3, scale, useUTC, (input) => { //TODO: 'input' is 'time', but TypeScript cannot find "time.nanosecondsDelta";
    let time = input as any;
    
    parser.readUInt24LE((days) => {
      let date;
      if (useUTC) {
        date = new Date(Date.UTC(2000, 0, days - 730118, 0, 0, 0, +time));
      } else {
        date = new Date(2000, 0, days - 730118, time.getHours(), time.getMinutes(), time.getSeconds(), time.getMilliseconds());
      }
      Object.defineProperty(date, 'nanosecondsDelta', {
        enumerable: false,
        value: time.nanosecondsDelta
      });
      callback(date);
    });
  });
}

function readDateTimeOffset(parser: Parser, dataLength: number, scale: number, callback: (value: Date) => void) {
  readTime(parser, dataLength - 5, scale, true, (input) => {//TODO: 'input' is 'time', but TypeScript cannot find "time.nanosecondsDelta";
    let time = input as any;
    parser.readUInt24LE((days) => {
      // offset
      parser.readInt16LE(() => {
        const date = new Date(Date.UTC(2000, 0, days - 730118, 0, 0, 0, +time));
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