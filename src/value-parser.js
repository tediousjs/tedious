'use strict';

const iconv = require('iconv-lite');
const sprintf = require('sprintf').sprintf;
const TYPE = require('./data-type').TYPE;
const guidParser = require('./guid-parser');

const readPrecision = require('./metadata-parser').readPrecision;
const readScale = require('./metadata-parser').readScale;
const readCollation = require('./metadata-parser').readCollation;
const convertLEBytesToString = require('./tracking-buffer/bigint').convertLEBytesToString;

const NULL = (1 << 16) - 1;
const MAX = (1 << 16) - 1;
const THREE_AND_A_THIRD = 3 + (1 / 3);
const MONEY_DIVISOR = 10000;
const PLP_NULL = new Buffer([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
const UNKNOWN_PLP_LEN = new Buffer([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
const DEFAULT_ENCODING = 'utf8';

function readTextPointerNull() {
  const state = this.currentState();
  const type = state.type;

  if (!type.hasTextPointerAndTimestamp) {
    return readDataLength;
  }

  if (this.buffer.length < this.position + 1) {
    return;
  }

  const textPointerLength = this.buffer.readUInt8(this.position, true);

  if (textPointerLength === 0) {
    state.textPointerNull = true;
  } else {
    if (this.buffer.length < this.position + 1 + textPointerLength + 8) {
      return;
    }

    // Appear to be dummy values, so consume and discard them.
    this.position += 1 + textPointerLength + 8;
  }

  return readDataLength;
}

function readDataLength() {
  const state = this.currentState();
  const type = state.type;

  if (state.textPointerNull) {
    state.dataLength = 0;
    return readValue;
  }

  if (state.metadata.isVariantValue) {
    state.dataLength = state.metadata.dataLength;
    return readValue;
  }

  // s2.2.4.2.1
  switch (type.id & 0x30) {
    case 0x10: // xx01xxxx - s2.2.4.2.1.1
      state.dataLength = 0;
      return readValue;

    case 0x20: // xx10xxxx - s2.2.4.2.1.3
      // Variable length
      if (state.metadata.dataLength === MAX) {
        return readValue;
      }

      switch (type.dataLengthLength) {
        case 0:
          break;

        case 1:
          if (this.buffer.length < this.position + 1) {
            return;
          }

          state.dataLength = this.buffer.readUInt8(this.position, true);
          this.position += 1;

          break;

        case 2:
          if (this.buffer.length < this.position + 2) {
            return;
          }

          state.dataLength = this.buffer.readUInt16LE(this.position, true);
          this.position += 2;

          break;

        case 4:
          if (this.buffer.length < this.position + 4) {
            return;
          }

          state.dataLength = this.buffer.readUInt32LE(this.position, true);
          this.position += 4;

          break;

        default:
          throw new Error('Unsupported dataLengthLength ' + type.dataLengthLength + ' for data type ' + type.name);
      }
      break;

    case 0x30:
      state.dataLength = 1 << ((type.id & 0x0C) >> 2);
  }

  return readValue;
}

function readInt() {
  if (this.buffer.length < this.position + 4) {
    return;
  }

  this.pushState({
    value: this.buffer.readInt32LE(this.position, true)
  });

  this.position += 4;

  return afterReadValue;
}

function readNVarChar() {
  const state = this.currentState();

  if (state.metadata.dataLength === MAX) {
    return readMaxNChars;
  } else {
    return readNChars;
  }
}

function readValue() {
  const state = this.currentState();
  const type = state.type;

  switch (type.name) {
    case 'Int':
      return readInt;

    case 'NVarChar':
      return readNVarChar;
  }

  return;

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

    case 'Real':
      return parser.readFloatLE(callback);

    case 'Float':
      return parser.readDoubleLE(callback);

    case 'FloatN':
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

    case 'Money':
    case 'SmallMoney':
    case 'MoneyN':
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

    case 'Bit':
      return parser.readUInt8((value) => {
        callback(!!value);
      });

    case 'BitN':
      switch (dataLength) {
        case 0:
          return callback(null);
        case 1:
          return parser.readUInt8((value) => {
            callback(!!value);
          });
      }

    case 'VarChar':
    case 'Char':
      const codepage = metaData.collation.codepage;
      if (metaData.dataLength === MAX) {
        return readMaxChars(parser, codepage, callback);
      } else {
        return readChars(parser, dataLength, codepage, callback);
      }

    case 'NVarChar':
    case 'NChar':
      if (metaData.dataLength === MAX) {
        return readMaxNChars(parser, callback);
      } else {
        return readNChars(parser, dataLength, callback);
      }

    case 'VarBinary':
    case 'Binary':
      if (metaData.dataLength === MAX) {
        return readMaxBinary(parser, callback);
      } else {
        return readBinary(parser, dataLength, callback);
      }

    case 'Text':
      if (textPointerNull) {
        return callback(null);
      } else {
        return readChars(parser, dataLength, metaData.collation.codepage, callback);
      }

    case 'NText':
      if (textPointerNull) {
        return callback(null);
      } else {
        return readNChars(parser, dataLength, callback);
      }

    case 'Image':
      if (textPointerNull) {
        return callback(null);
      } else {
        return readBinary(parser, dataLength, callback);
      }

    case 'Xml':
      return readMaxNChars(parser, callback);

    case 'SmallDateTime':
      return readSmallDateTime(parser, options.useUTC, callback);

    case 'DateTime':
      return readDateTime(parser, options.useUTC, callback);

    case 'DateTimeN':
      switch (dataLength) {
        case 0:
          return callback(null);
        case 4:
          return readSmallDateTime(parser, options.useUTC, callback);
        case 8:
          return readDateTime(parser, options.useUTC, callback);
      }

    case 'TimeN':
      if (dataLength === 0) {
        return callback(null);
      } else {
        return readTime(parser, dataLength, metaData.scale, options.useUTC, callback);
      }

    case 'DateN':
      if (dataLength === 0) {
        return callback(null);
      } else {
        return readDate(parser, options.useUTC, callback);
      }

    case 'DateTime2N':
      if (dataLength === 0) {
        return callback(null);
      } else {
        return readDateTime2(parser, dataLength, metaData.scale, options.useUTC, callback);
      }

    case 'DateTimeOffsetN':
      if (dataLength === 0) {
        return callback(null);
      } else {
        return readDateTimeOffset(parser, dataLength, metaData.scale, callback);
      }

    case 'NumericN':
    case 'DecimalN':
      if (dataLength === 0) {
        return callback(null);
      } else {
        return parser.readUInt8((sign) => {
          sign = sign === 1 ? 1 : -1;

          let readValue;
          switch (dataLength - 1) {
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
              return parser.emit('error', new Error(sprintf('Unsupported numeric size %d', dataLength - 1)));
          }

          readValue.call(parser, (value) => {
            callback((value * sign) / Math.pow(10, metaData.scale));
          });
        });
      }

    case 'UniqueIdentifierN':
      switch (dataLength) {
        case 0:
          return callback(null);
        case 0x10:
          return parser.readBuffer(0x10, (data) => {
            callback(guidParser.arrayToGuid(data));
          });

        default:
          return parser.emit('error', new Error(sprintf('Unsupported guid size %d', dataLength - 1)));
      }

    case 'UDT':
      return readMaxBinary(parser, callback);

    case 'Variant':
      const valueMetaData = metaData.valueMetaData = {};
      Object.defineProperty(valueMetaData, 'isVariantValue', {value: true});
      return parser.readUInt8((baseType) => {
        return parser.readUInt8((propBytes) => {
          valueMetaData.dataLength = dataLength - propBytes - 2;
          valueMetaData.type = TYPE[baseType];
          return readPrecision(parser, valueMetaData.type, (precision) => {
            valueMetaData.precision = precision;
            return readScale(parser, valueMetaData.type, (scale) => {
              valueMetaData.scale = scale;
              return readCollation(parser, valueMetaData.type, (collation) => {
                valueMetaData.collation = collation;
                if (baseType === 0xA5 || baseType === 0xAD || baseType === 0xA7 || baseType === 0xAF || baseType === 0xE7 || baseType === 0xEF) {
                  return readDataLength(parser, valueMetaData.type, {}, null, (maxDataLength) => {
                    valueMetaData.dataLength = maxDataLength;
                    return valueParse(parser, valueMetaData, options, callback);
                  });
                } else {
                  return valueParse(parser, valueMetaData, options, callback);
                }
              });
            });
          });
        });
      });

    default:
      return parser.emit('error', new Error(sprintf('Unrecognised type %s', type.name)));
  }
}

function afterReadValue() {
  const valueState = this.popState();

  this.popState();

  const next = this.popState().next;
  this.pushState(valueState);
  return next;
}

module.exports = valueParse;
function valueParse(parser, metadata, next) {
  parser.pushState({ next: next });

  parser.pushState({
    type: metadata.type,
    metadata: metadata,
    textPointerNull: undefined,
    dataLength: undefined,
  });

  return readTextPointerNull;
}

function readBinary(parser, dataLength, callback) {
  if (dataLength === NULL) {
    return callback(null);
  } else {
    return parser.readBuffer(dataLength, callback);
  }
}

function readChars(parser, dataLength, codepage, callback) {
  if (codepage == null) {
    codepage = DEFAULT_ENCODING;
  }

  if (dataLength === NULL) {
    return callback(null);
  } else {
    return parser.readBuffer(dataLength, (data) => {
      callback(iconv.decode(data, codepage));
    });
  }
}

function readNChars() {
  const state = this.currentState();

  if (!state.dataLength) {
    this.pushState({ value: null });
    return afterReadValue;
  }

  if (!this.bytesAvailable(state.dataLength)) {
    return;
  }

  this.pushState({ value: this.readString('ucs2', 0, state.dataLength) });
  this.consumeBytes(state.dataLength);

  return afterReadValue;
}

function readMaxBinary(parser, callback) {
  return readMax(parser, callback);
}

function readMaxChars(parser, codepage, callback) {
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

function readMaxNChars() {
  this.pushState({ next: afterReadMaxNChars });
  return readMax;
}

function afterReadMaxNChars() {
  const valueState = this.popState();

  if (valueState.value) {
    this.pushState({ value: valueState.value.toString('ucs2') });
  } else {
    this.pushState({ value: null });
  }

  return afterReadValue;
}

function readMax() {
  if (!this.bytesAvailable(8)) {
    return;
  }

  const type = this.readBuffer(0, 8);
  this.consumeBytes(8);

  if (type.equals(PLP_NULL)) {
    this.pushState({ value: null });

    return afterReadMax;
  }

  if (type.equals(UNKNOWN_PLP_LEN)) {
    return readMaxUnknownLength;
  }

  const low = type.readUInt32LE(0);
  const high = type.readUInt32LE(4);

  if (high >= (2 << (53 - 32))) {
    console.warn('Read UInt64LE > 53 bits : high=' + high + ', low=' + low);
  }

  const length = low + (0x100000000 * high);
  this.pushState({ buffer: new Buffer(length), offset: 0 });

  return readMaxKnownLength;
}

function afterReadMax() {
  const valueState = this.popState();
  const next = this.popState().next;
  this.pushState(valueState);
  return next;
}

function readMaxKnownLength() {
  const state = this.currentState();

  while (this.bytesAvailable(4)) {
    const chunkLength = this.readUInt32LE();

    if (!this.bytesAvailable(4 + chunkLength)) {
      return;
    }

    this.consumeBytes(4);

    if (!chunkLength) {
      if (state.offset !== state.buffer.length) {
        throw new Error('Partially Length-prefixed Bytes unmatched lengths : expected ' + state.buffer.length + ', but got ' + state.offset + ' bytes');
      }

      this.popState();
      this.pushState({ value: state.buffer });
      return afterReadMax;
    }

    this.buffer.copy(state.buffer, state.offset, this.position, this.position += chunkLength);
    state.offset += chunkLength;
  }
}

function readMaxUnknownLength(parser, callback) {
  const chunks = [];

  let length = 0;
  function next(done) {
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

function readSmallDateTime(parser, useUTC, callback) {
  parser.readUInt16LE((days) => {
    parser.readUInt16LE((minutes) => {
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
      callback(value);
    });
  });
}

function readDateTime(parser, useUTC, callback) {
  parser.readInt32LE((days) => {
    parser.readUInt32LE((threeHundredthsOfSecond) => {
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

      callback(value);
    });
  });
}

function readTime(parser, dataLength, scale, useUTC, callback) {
  let readValue;
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

  readValue.call(parser, (value) => {
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

function readDate(parser, useUTC, callback) {
  parser.readUInt24LE((days) => {
    if (useUTC) {
      callback(new Date(Date.UTC(2000, 0, days - 730118)));
    } else {
      callback(new Date(2000, 0, days - 730118));
    }
  });
}

function readDateTime2(parser, dataLength, scale, useUTC, callback) {
  readTime(parser, dataLength - 3, scale, useUTC, (time) => {
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

function readDateTimeOffset(parser, dataLength, scale, callback) {
  readTime(parser, dataLength - 5, scale, true, (time) => {
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
