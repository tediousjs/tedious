const iconv = require('iconv-lite');
const sprintf = require('sprintf-js').sprintf;
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

async function _readTextPointerNull(parser, type) {
  if (type.hasTextPointerAndTimestamp) {
    const textPointerLength = await parser._readUInt8();
    if (textPointerLength !== 0) {
      // Appear to be dummy values, so consume and discard them.
      await parser._readBuffer(textPointerLength);
      await parser._readBuffer(8);
      return undefined;
    }
    else {
      return true;
    }
  } else {
    return undefined;
  }
}

async function _readDataLength(parser, type, metaData, textPointerNull) {
  if (textPointerNull) {
    return 0;
  }

  if (metaData.isVariantValue) {
    return metaData.dataLength;
  }

  // s2.2.4.2.1
  switch (type.id & 0x30) {
    case 0x10: // xx01xxxx - s2.2.4.2.1.1
      return 0;

    case 0x20: // xx10xxxx - s2.2.4.2.1.3
      // Variable length
      if (metaData.dataLength !== MAX) {
        switch (type.dataLengthLength) {
          case 0:
            return undefined;

          case 1:
            return await parser._readUInt8();

          case 2:
            return await parser._readUInt16LE();

          case 4:
            return await parser._readUInt32LE();

          default:
            return parser.emit('error', new Error('Unsupported dataLengthLength ' + type.dataLengthLength + ' for data type ' + type.name));
        }
      } else {
        return undefined;
      }

    case 0x30:
      return (1 << ((type.id & 0x0C) >> 2));
  }
}

module.exports = _valueParse;
// prototyping for just int and varchar types
async function _valueParse(parser, metaData, options) {
  const type = metaData.type;
  const textPointerNull = await _readTextPointerNull(parser, type);
  const dataLength = await _readDataLength(parser, type, metaData, textPointerNull);
  switch (type.name) {
    case 'Null':
      return null;

    case 'TinyInt':
      return await parser._readUInt8();

    case 'Int':
      return await parser._readInt32LE();

    case 'SmallInt':
      return await parser._readInt16LE();

    case 'BigInt':
      const buffer = await parser._readBuffer(8);
      return await convertLEBytesToString(buffer);

    case 'IntN':
      switch (dataLength) {
        case 0:
          return null;
        case 1:
          return await parser._readUInt8();
        case 2:
          return await parser._readInt16LE();
        case 4:
          return await parser._readInt32LE();
        case 8:
          const buffer = await parser._readBuffer(8);
          // should convert convertLEBytesToString to async too - doesn't work on bigint yet
          return await convertLEBytesToString(buffer);

        default:
          return parser.emit('error', new Error('Unsupported dataLength ' + dataLength + ' for IntN'));
      }

    case 'VarChar':
    case 'Char':
      const codepage = metaData.collation.codepage;
      if (metaData.dataLength === MAX) {
        return readMaxChars(parser, codepage, callback);
      } else {
        return await _readChars(parser, dataLength, codepage, NULL);
      }

    //TODO: add all the other datatypes
    default:
      return parser.emit('error', new Error(sprintf('Unrecognised type %s', type.name)));
  }
}

function readBinary(parser, dataLength, nullValue, callback) {
  if (dataLength === nullValue) {
    return callback(null);
  } else {
    return parser.readBuffer(dataLength, callback);
  }
}

async function _readChars(parser, dataLength, codepage, nullValue) {
  if (codepage == null) {
    codepage = DEFAULT_ENCODING;
  }

  if (dataLength === nullValue) {
    return null;
  } else {
    const data = await parser._readBuffer(dataLength);
    return iconv.decode(data, codepage);
  }
}

function readNChars(parser, dataLength, nullValue, callback) {
  if (dataLength === nullValue) {
    return callback(null);
  } else {
    return parser.readBuffer(dataLength, (data) => {
      callback(data.toString('ucs2'));
    });
  }
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

function readMaxNChars(parser, callback) {
  readMax(parser, (data) => {
    if (data) {
      callback(data.toString('ucs2'));
    } else {
      callback(null);
    }
  });
}

function readMax(parser, callback) {
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

function readMaxKnownLength(parser, totalLength, callback) {
  const data = new Buffer(totalLength).fill(0);

  let offset = 0;
  function next(done) {
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
        value = new Date(Date.UTC(1900, 0, 1 + days, 0, minutes));
      } else {
        value = new Date(1900, 0, 1 + days, 0, minutes);
      }
      callback(value);
    });
  });
}

function readDateTime(parser, useUTC, callback) {
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
