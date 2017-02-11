'use strict';

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var iconv = require('iconv-lite');
var sprintf = require('sprintf').sprintf;
var TYPE = require('./data-type').TYPE;
var guidParser = require('./guid-parser');

var readPrecision = require('./metadata-parser').readPrecision;
var readScale = require('./metadata-parser').readScale;
var readCollation = require('./metadata-parser').readCollation;
var convertLEBytesToString = require('./tracking-buffer/bigint').convertLEBytesToString;

var NULL = (1 << 16) - 1;
var MAX = (1 << 16) - 1;
var THREE_AND_A_THIRD = 3 + 1 / 3;
var MONEY_DIVISOR = 10000;
var PLP_NULL = new Buffer([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
var UNKNOWN_PLP_LEN = new Buffer([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
var DEFAULT_ENCODING = 'utf8';

function readTextPointerNull(parser, type, callback) {
  if (type.hasTextPointerAndTimestamp) {
    parser.readUInt8(function (textPointerLength) {
      if (textPointerLength !== 0) {
        // Appear to be dummy values, so consume and discard them.
        parser.readBuffer(textPointerLength, function () {
          parser.readBuffer(8, function () {
            callback(undefined);
          });
        });
      } else {
        callback(true);
      }
    });
  } else {
    callback(undefined);
  }
}

function readDataLength(parser, type, metaData, textPointerNull, callback) {
  if (textPointerNull) {
    return callback(0);
  }

  if (metaData.isVariantValue) {
    return callback(metaData.dataLength);
  }

  // s2.2.4.2.1
  switch (type.id & 0x30) {
    case 0x10:
      // xx01xxxx - s2.2.4.2.1.1
      return callback(0);

    case 0x20:
      // xx10xxxx - s2.2.4.2.1.3
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

module.exports = valueParse;
function valueParse(parser, metaData, options, callback) {
  var type = metaData.type;

  readTextPointerNull(parser, type, function (textPointerNull) {
    readDataLength(parser, type, metaData, textPointerNull, function (dataLength) {
      var _ret = function () {
        switch (type.name) {
          case 'Null':
            return {
              v: callback(null)
            };

          case 'TinyInt':
            return {
              v: parser.readUInt8(callback)
            };

          case 'Int':
            return {
              v: parser.readInt32LE(callback)
            };

          case 'SmallInt':
            return {
              v: parser.readInt16LE(callback)
            };

          case 'BigInt':
            return {
              v: parser.readBuffer(8, function (buffer) {
                callback(convertLEBytesToString(buffer));
              })
            };

          case 'IntN':
            switch (dataLength) {
              case 0:
                return {
                  v: callback(null)
                };
              case 1:
                return {
                  v: parser.readUInt8(callback)
                };
              case 2:
                return {
                  v: parser.readInt16LE(callback)
                };
              case 4:
                return {
                  v: parser.readInt32LE(callback)
                };
              case 8:
                return {
                  v: parser.readBuffer(8, function (buffer) {
                    callback(convertLEBytesToString(buffer));
                  })
                };

              default:
                return {
                  v: parser.emit('error', new Error('Unsupported dataLength ' + dataLength + ' for IntN'))
                };
            }

          case 'Real':
            return {
              v: parser.readFloatLE(callback)
            };

          case 'Float':
            return {
              v: parser.readDoubleLE(callback)
            };

          case 'FloatN':
            switch (dataLength) {
              case 0:
                return {
                  v: callback(null)
                };
              case 4:
                return {
                  v: parser.readFloatLE(callback)
                };
              case 8:
                return {
                  v: parser.readDoubleLE(callback)
                };

              default:
                return {
                  v: parser.emit('error', new Error('Unsupported dataLength ' + dataLength + ' for FloatN'))
                };
            }

          case 'Money':
          case 'SmallMoney':
          case 'MoneyN':
            switch (dataLength) {
              case 0:
                return {
                  v: callback(null)
                };
              case 4:
                return {
                  v: parser.readInt32LE(function (value) {
                    callback(value / MONEY_DIVISOR);
                  })
                };
              case 8:
                return {
                  v: parser.readInt32LE(function (high) {
                    parser.readUInt32LE(function (low) {
                      callback((low + 0x100000000 * high) / MONEY_DIVISOR);
                    });
                  })
                };

              default:
                return {
                  v: parser.emit('error', new Error('Unsupported dataLength ' + dataLength + ' for MoneyN'))
                };
            }

          case 'Bit':
            return {
              v: parser.readUInt8(function (value) {
                callback(!!value);
              })
            };

          case 'BitN':
            switch (dataLength) {
              case 0:
                return {
                  v: callback(null)
                };
              case 1:
                return {
                  v: parser.readUInt8(function (value) {
                    callback(!!value);
                  })
                };
            }

          case 'VarChar':
          case 'Char':
            var codepage = metaData.collation.codepage;
            if (metaData.dataLength === MAX) {
              return {
                v: readMaxChars(parser, codepage, callback)
              };
            } else {
              return {
                v: readChars(parser, dataLength, codepage, callback)
              };
            }

          case 'NVarChar':
          case 'NChar':
            if (metaData.dataLength === MAX) {
              return {
                v: readMaxNChars(parser, callback)
              };
            } else {
              return {
                v: readNChars(parser, dataLength, callback)
              };
            }

          case 'VarBinary':
          case 'Binary':
            if (metaData.dataLength === MAX) {
              return {
                v: readMaxBinary(parser, callback)
              };
            } else {
              return {
                v: readBinary(parser, dataLength, callback)
              };
            }

          case 'Text':
            if (textPointerNull) {
              return {
                v: callback(null)
              };
            } else {
              return {
                v: readChars(parser, dataLength, metaData.collation.codepage, callback)
              };
            }

          case 'NText':
            if (textPointerNull) {
              return {
                v: callback(null)
              };
            } else {
              return {
                v: readNChars(parser, dataLength, callback)
              };
            }

          case 'Image':
            if (textPointerNull) {
              return {
                v: callback(null)
              };
            } else {
              return {
                v: readBinary(parser, dataLength, callback)
              };
            }

          case 'Xml':
            return {
              v: readMaxNChars(parser, callback)
            };

          case 'SmallDateTime':
            return {
              v: readSmallDateTime(parser, options.useUTC, callback)
            };

          case 'DateTime':
            return {
              v: readDateTime(parser, options.useUTC, callback)
            };

          case 'DateTimeN':
            switch (dataLength) {
              case 0:
                return {
                  v: callback(null)
                };
              case 4:
                return {
                  v: readSmallDateTime(parser, options.useUTC, callback)
                };
              case 8:
                return {
                  v: readDateTime(parser, options.useUTC, callback)
                };
            }

          case 'TimeN':
            if (dataLength === 0) {
              return {
                v: callback(null)
              };
            } else {
              return {
                v: readTime(parser, dataLength, metaData.scale, options.useUTC, callback)
              };
            }

          case 'DateN':
            if (dataLength === 0) {
              return {
                v: callback(null)
              };
            } else {
              return {
                v: readDate(parser, options.useUTC, callback)
              };
            }

          case 'DateTime2N':
            if (dataLength === 0) {
              return {
                v: callback(null)
              };
            } else {
              return {
                v: readDateTime2(parser, dataLength, metaData.scale, options.useUTC, callback)
              };
            }

          case 'DateTimeOffsetN':
            if (dataLength === 0) {
              return {
                v: callback(null)
              };
            } else {
              return {
                v: readDateTimeOffset(parser, dataLength, metaData.scale, callback)
              };
            }

          case 'NumericN':
          case 'DecimalN':
            if (dataLength === 0) {
              return {
                v: callback(null)
              };
            } else {
              return {
                v: parser.readUInt8(function (sign) {
                  sign = sign === 1 ? 1 : -1;

                  var readValue = void 0;
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

                  readValue.call(parser, function (value) {
                    callback(value * sign / Math.pow(10, metaData.scale));
                  });
                })
              };
            }

          case 'UniqueIdentifierN':
            switch (dataLength) {
              case 0:
                return {
                  v: callback(null)
                };
              case 0x10:
                return {
                  v: parser.readBuffer(0x10, function (data) {
                    callback(guidParser.arrayToGuid(data));
                  })
                };

              default:
                return {
                  v: parser.emit('error', new Error(sprintf('Unsupported guid size %d', dataLength - 1)))
                };
            }

          case 'UDT':
            return {
              v: readMaxBinary(parser, callback)
            };

          case 'Variant':
            if (dataLength === 0) {
              return {
                v: callback(null)
              };
            }

            var valueMetaData = metaData.valueMetaData = {};
            Object.defineProperty(valueMetaData, 'isVariantValue', { value: true });
            return {
              v: parser.readUInt8(function (baseType) {
                return parser.readUInt8(function (propBytes) {
                  valueMetaData.dataLength = dataLength - propBytes - 2;
                  valueMetaData.type = TYPE[baseType];
                  return readPrecision(parser, valueMetaData.type, function (precision) {
                    valueMetaData.precision = precision;
                    return readScale(parser, valueMetaData.type, function (scale) {
                      valueMetaData.scale = scale;
                      return readCollation(parser, valueMetaData.type, function (collation) {
                        valueMetaData.collation = collation;
                        if (baseType === 0xA5 || baseType === 0xAD || baseType === 0xA7 || baseType === 0xAF || baseType === 0xE7 || baseType === 0xEF) {
                          return readDataLength(parser, valueMetaData.type, {}, null, function (maxDataLength) {
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
              })
            };

          default:
            return {
              v: parser.emit('error', new Error(sprintf('Unrecognised type %s', type.name)))
            };
        }
      }();

      if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
    });
  });
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
    return parser.readBuffer(dataLength, function (data) {
      callback(iconv.decode(data, codepage));
    });
  }
}

function readNChars(parser, dataLength, callback) {
  if (dataLength === NULL) {
    return callback(null);
  } else {
    return parser.readBuffer(dataLength, function (data) {
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

  readMax(parser, function (data) {
    if (data) {
      callback(iconv.decode(data, codepage));
    } else {
      callback(null);
    }
  });
}

function readMaxNChars(parser, callback) {
  readMax(parser, function (data) {
    if (data) {
      callback(data.toString('ucs2'));
    } else {
      callback(null);
    }
  });
}

function readMax(parser, callback) {
  parser.readBuffer(8, function (type) {
    if (type.equals(PLP_NULL)) {
      return callback(null);
    } else if (type.equals(UNKNOWN_PLP_LEN)) {
      return readMaxUnknownLength(parser, callback);
    } else {
      var low = type.readUInt32LE(0);
      var high = type.readUInt32LE(4);

      if (high >= 2 << 53 - 32) {
        console.warn('Read UInt64LE > 53 bits : high=' + high + ', low=' + low);
      }

      var expectedLength = low + 0x100000000 * high;
      return readMaxKnownLength(parser, expectedLength, callback);
    }
  });
}

function readMaxKnownLength(parser, totalLength, callback) {
  var data = new Buffer(totalLength);

  var offset = 0;
  function next(done) {
    parser.readUInt32LE(function (chunkLength) {
      if (!chunkLength) {
        return done();
      }

      parser.readBuffer(chunkLength, function (chunk) {
        chunk.copy(data, offset);
        offset += chunkLength;

        next(done);
      });
    });
  }

  next(function () {
    if (offset !== totalLength) {
      parser.emit('error', new Error('Partially Length-prefixed Bytes unmatched lengths : expected ' + totalLength + ', but got ' + offset + ' bytes'));
    }

    callback(data);
  });
}

function readMaxUnknownLength(parser, callback) {
  var chunks = [];

  var length = 0;
  function next(done) {
    parser.readUInt32LE(function (chunkLength) {
      if (!chunkLength) {
        return done();
      }

      parser.readBuffer(chunkLength, function (chunk) {
        chunks.push(chunk);
        length += chunkLength;

        next(done);
      });
    });
  }

  next(function () {
    callback(Buffer.concat(chunks, length));
  });
}

function readSmallDateTime(parser, useUTC, callback) {
  parser.readUInt16LE(function (days) {
    parser.readUInt16LE(function (minutes) {
      var value = void 0;
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
  parser.readInt32LE(function (days) {
    parser.readUInt32LE(function (threeHundredthsOfSecond) {
      var milliseconds = threeHundredthsOfSecond * THREE_AND_A_THIRD;

      var value = void 0;
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
  var readValue = void 0;
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

  readValue.call(parser, function (value) {
    if (scale < 7) {
      for (var i = scale; i < 7; i++) {
        value *= 10;
      }
    }

    var date = void 0;
    if (useUTC) {
      date = new Date(Date.UTC(1970, 0, 1, 0, 0, 0, value / 10000));
    } else {
      date = new Date(1970, 0, 1, 0, 0, 0, value / 10000);
    }
    Object.defineProperty(date, 'nanosecondsDelta', {
      enumerable: false,
      value: value % 10000 / Math.pow(10, 7)
    });
    callback(date);
  });
}

function readDate(parser, useUTC, callback) {
  parser.readUInt24LE(function (days) {
    if (useUTC) {
      callback(new Date(Date.UTC(2000, 0, days - 730118)));
    } else {
      callback(new Date(2000, 0, days - 730118));
    }
  });
}

function readDateTime2(parser, dataLength, scale, useUTC, callback) {
  readTime(parser, dataLength - 3, scale, useUTC, function (time) {
    parser.readUInt24LE(function (days) {
      var date = void 0;
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
  readTime(parser, dataLength - 5, scale, true, function (time) {
    parser.readUInt24LE(function (days) {
      // offset
      parser.readInt16LE(function () {
        var date = new Date(Date.UTC(2000, 0, days - 730118, 0, 0, 0, +time));
        Object.defineProperty(date, 'nanosecondsDelta', {
          enumerable: false,
          value: time.nanosecondsDelta
        });
        callback(date);
      });
    });
  });
}