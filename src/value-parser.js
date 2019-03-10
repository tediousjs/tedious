const iconv = require('iconv-lite');
const sprintf = require('sprintf-js').sprintf;
const { typeByName: TYPES } = require('./data-type');

const NumericN = require('./data-types/numericn');

const NULL = (1 << 16) - 1;
const MAX = (1 << 16) - 1;
const PLP_NULL = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
const UNKNOWN_PLP_LEN = Buffer.from([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
const DEFAULT_ENCODING = 'utf8';

function readTextPointerNull(parser, type, callback) {
  if (type.hasTextPointerAndTimestamp) {
    parser.readUInt8((textPointerLength) => {
      if (textPointerLength !== 0) {
        // Appear to be dummy values, so consume and discard them.
        parser.readBuffer(textPointerLength, () => {
          parser.readBuffer(8, () => {
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

function readDataLength(parser, type, metaData, callback) {
  // s2.2.4.2.1
  switch (type.id & 0x30) {
    case 0x10: // xx01xxxx - s2.2.4.2.1.1
      return callback(0);

    case 0x20: // xx10xxxx - s2.2.4.2.1.3
      // Variable length
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

    case 0x30:
      return callback(1 << ((type.id & 0x0C) >> 2));
  }
}

module.exports = valueParse;
function valueParse(parser, metaData, options, callback) {
  const type = metaData.type;

  switch (type.name) {
    case 'Null':
      return callback(null);

    case 'TinyInt':
      return parser.awaitData(1, () => {
        const result = TYPES.TinyInt.fromBuffer(parser.buffer, parser.position);
        parser.position += 1;
        callback(result);
      });

    case 'SmallInt':
      return parser.awaitData(2, () => {
        const result = TYPES.SmallInt.fromBuffer(parser.buffer, parser.position);
        parser.position += 2;
        callback(result);
      });

    case 'Int':
      return parser.awaitData(4, () => {
        const result = TYPES.Int.fromBuffer(parser.buffer, parser.position);
        parser.position += 4;
        callback(result);
      });

    case 'BigInt':
      return parser.awaitData(8, () => {
        const result = TYPES.BigInt.fromBuffer(parser.buffer, parser.position);
        parser.position += 8;
        callback(result);
      });

    case 'IntN':
      return readDataLength(parser, type, metaData, (dataLength) => {
        switch (dataLength) {
          case 0:
            return callback(null);
          case 1:
            return parser.awaitData(1, () => {
              const result = TYPES.TinyInt.fromBuffer(parser.buffer, parser.position);
              parser.position += 1;
              callback(result);
            });
          case 2:
            return parser.awaitData(2, () => {
              const result = TYPES.SmallInt.fromBuffer(parser.buffer, parser.position);
              parser.position += 2;
              callback(result);
            });
          case 4:
            return parser.awaitData(4, () => {
              const result = TYPES.Int.fromBuffer(parser.buffer, parser.position);
              parser.position += 4;
              callback(result);
            });
          case 8:
            return parser.awaitData(8, () => {
              const result = TYPES.BigInt.fromBuffer(parser.buffer, parser.position);
              parser.position += 8;
              callback(result);
            });

          default:
            return parser.emit('error', new Error('Unsupported dataLength ' + dataLength + ' for IntN'));
        }
      });

    case 'Real':
      return readDataLength(parser, type, metaData, (dataLength) => {
        return parser.awaitData(4, () => {
          const result = TYPES.Real.fromBuffer(parser.buffer, parser.position);
          parser.position += 4;
          callback(result);
        });
      });

    case 'Float':
      return parser.awaitData(8, () => {
        const result = TYPES.Float.fromBuffer(parser.buffer, parser.position);
        parser.position += 8;
        callback(result);
      });

    case 'FloatN':
      return readDataLength(parser, type, metaData, (dataLength) => {
        switch (dataLength) {
          case 0:
            return callback(null);

          case 4:
            return parser.awaitData(4, () => {
              const result = TYPES.Real.fromBuffer(parser.buffer, parser.position);
              parser.position += 4;
              callback(result);
            });

          case 8:
            return parser.awaitData(8, () => {
              const result = TYPES.Float.fromBuffer(parser.buffer, parser.position);
              parser.position += 8;
              callback(result);
            });

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
            return parser.awaitData(4, () => {
              const result = TYPES.SmallMoney.fromBuffer(parser.buffer, parser.position);
              parser.position += 4;
              callback(result);
            });

          case 8:
            return parser.awaitData(8, () => {
              const result = TYPES.Money.fromBuffer(parser.buffer, parser.position);
              parser.position += 8;
              callback(result);
            });

          default:
            return parser.emit('error', new Error('Unsupported dataLength ' + dataLength + ' for MoneyN'));
        }
      });

    case 'Bit':
      return parser.awaitData(1, () => {
        const result = TYPES.Bit.fromBuffer(parser.buffer, parser.position);
        parser.position += 1;
        callback(result);
      });

    case 'BitN':
      return readDataLength(parser, type, metaData, (dataLength) => {
        switch (dataLength) {
          case 0:
            return callback(null);
          case 1:
            return parser.awaitData(1, () => {
              const result = TYPES.Bit.fromBuffer(parser.buffer, parser.position);
              parser.position += 1;
              callback(result);
            });
          default:
            return parser.emit('error', new Error('Unsupported dataLength ' + dataLength + ' for BitN'));
        }
      });

    case 'VarChar':
    case 'Char':
      const codepage = metaData.collation.codepage;
      if (metaData.dataLength === MAX) {
        return readMaxChars(parser, codepage, callback);
      } else {
        return readDataLength(parser, type, metaData, (dataLength) => {
          if (dataLength === NULL) {
            return callback(null);
          } else {
            return parser.awaitData(dataLength, () => {
              const result = TYPES.Char.fromBuffer(parser.buffer, parser.position, dataLength, codepage);
              parser.position += dataLength;
              callback(result);
            });
          }
        });
      }

    case 'NVarChar':
    case 'NChar':
      if (metaData.dataLength === MAX) {
        return readMaxNChars(parser, callback);
      } else {
        return readDataLength(parser, type, metaData, (dataLength) => {
          if (dataLength === NULL) {
            return callback(null);
          } else {
            return parser.awaitData(dataLength, () => {
              const result = TYPES.NChar.fromBuffer(parser.buffer, parser.position, dataLength);
              parser.position += dataLength;
              callback(result);
            });
          }
        });
      }

    case 'VarBinary':
    case 'Binary':
      if (metaData.dataLength === MAX) {
        return readMaxBinary(parser, callback);
      } else {
        return readDataLength(parser, type, metaData, (dataLength) => {
          if (dataLength === NULL) {
            return null;
          } else {
            return parser.awaitData(dataLength, () => {
              const result = TYPES.Binary.fromBuffer(parser.buffer, parser.position, dataLength);
              parser.position += dataLength;
              callback(result);
            });
          }
        });
      }

    case 'Text':
      return readTextPointerNull(parser, type, (textPointerNull) => {
        if (textPointerNull) {
          return callback(null);
        }

        readDataLength(parser, type, metaData, (dataLength) => {
          if (dataLength === PLP_NULL) {
            return callback(null);
          } else {
            return parser.awaitData(dataLength, () => {
              const result = TYPES.Char.fromBuffer(parser.buffer, parser.position, dataLength, metaData.collation.codepage);
              parser.position += dataLength;
              callback(result);
            });
          }
        });
      });

    case 'NText':
      return readTextPointerNull(parser, type, (textPointerNull) => {
        if (textPointerNull) {
          return callback(null);
        }

        readDataLength(parser, type, metaData, (dataLength) => {
          if (dataLength === PLP_NULL) {
            return callback(null);
          } else {
            return parser.awaitData(dataLength, () => {
              const result = TYPES.NChar.fromBuffer(parser.buffer, parser.position, dataLength);
              parser.position += dataLength;
              callback(result);
            });
          }
        });
      });

    case 'Image':
      return readTextPointerNull(parser, type, (textPointerNull) => {
        if (textPointerNull) {
          return callback(null);
        }

        readDataLength(parser, type, metaData, (dataLength) => {
          if (dataLength === PLP_NULL) {
            return callback(null);
          } else {
            return parser.awaitData(dataLength, () => {
              const result = TYPES.Binary.fromBuffer(parser.buffer, parser.position, dataLength);
              parser.position += dataLength;
              callback(result);
            });
          }
        });
      });

    case 'Xml':
      return readMaxNChars(parser, callback);

    case 'SmallDateTime':
      return parser.awaitData(4, () => {
        const result = TYPES.SmallDateTime.fromBuffer(parser.buffer, parser.position, options);
        parser.position += 4;
        callback(result);
      });

    case 'DateTime':
      return parser.awaitData(8, () => {
        const result = TYPES.DateTime.fromBuffer(parser.buffer, parser.position, options);
        parser.position += 8;
        callback(result);
      });

    case 'DateTimeN':
      return readDataLength(parser, type, metaData, (dataLength) => {
        switch (dataLength) {
          case 0:
            return callback(null);
          case 4:
            return parser.awaitData(4, () => {
              const result = TYPES.SmallDateTime.fromBuffer(parser.buffer, parser.position, options);
              parser.position += 4;
              callback(result);
            });
          case 8:
            return parser.awaitData(8, () => {
              const result = TYPES.DateTime.fromBuffer(parser.buffer, parser.position, options);
              parser.position += 8;
              callback(result);
            });
          default:
            return parser.emit('error', new Error('Unsupported dataLength ' + dataLength + ' for DateTimeN'));
        }
      });

    case 'Time':
      return readDataLength(parser, type, metaData, (dataLength) => {
        if (dataLength === 0) {
          return callback(null);
        } else {
          return parser.awaitData(dataLength, () => {
            const result = TYPES.Time.fromBuffer(parser.buffer, parser.position, metaData.scale, options);
            parser.position += dataLength;
            callback(result);
          });
        }
      });

    case 'Date':
      return readDataLength(parser, type, metaData, (dataLength) => {
        if (dataLength === 0) {
          return callback(null);
        } else {
          return parser.awaitData(3, () => {
            const result = TYPES.Date.fromBuffer(parser.buffer, parser.position, options);
            parser.position += 3;
            callback(result);
          });
        }
      });

    case 'DateTime2':
      return readDataLength(parser, type, metaData, (dataLength) => {
        if (dataLength === 0) {
          return callback(null);
        } else {
          return parser.awaitData(dataLength, () => {
            const result = TYPES.DateTime2.fromBuffer(parser.buffer, parser.position, metaData.scale, options);
            parser.position += dataLength;
            callback(result);
          });
        }
      });

    case 'DateTimeOffset':
      return readDataLength(parser, type, metaData, (dataLength) => {
        if (dataLength === 0) {
          return callback(null);
        } else {
          return parser.awaitData(dataLength, () => {
            const result = TYPES.DateTimeOffset.fromBuffer(parser.buffer, parser.position, metaData.scale, options);
            parser.position += dataLength;
            callback(result);
          });
        }
      });

    case 'NumericN':
    case 'DecimalN':
      return readDataLength(parser, type, metaData, (dataLength) => {
        if (dataLength === 0) {
          return callback(null);
        } else {
          return parser.awaitData(dataLength, () => {
            const result = NumericN.fromBuffer(parser.buffer, parser.position, dataLength, metaData.scale);
            parser.position += dataLength;
            callback(result);
          });
        }
      });

    case 'UniqueIdentifier':
      return readDataLength(parser, type, metaData, (dataLength) => {
        switch (dataLength) {
          case 0:
            return callback(null);

          case 16:
            return parser.awaitData(16, () => {
              const result = TYPES.UniqueIdentifier.fromBuffer(parser.buffer, parser.position);
              parser.position += 16;
              callback(result);
            });

          default:
            return parser.emit('error', new Error(sprintf('Unsupported guid size %d', dataLength - 1)));
        }
      });

    case 'UDT':
      return readMaxBinary(parser, callback);

    case 'Variant':
      return readDataLength(parser, type, metaData, (dataLength) => {
        if (dataLength === 0) {
          return callback(null);
        }

        return parser.awaitData(dataLength, () => {
          const result = TYPES.Variant.fromBuffer(parser.buffer, parser.position, dataLength, options);
          parser.position += dataLength;
          callback(result);
        });
      });

    default:
      return parser.emit('error', new Error(sprintf('Unrecognised type %s', type.name)));
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
  const data = Buffer.alloc(totalLength, 0);

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
