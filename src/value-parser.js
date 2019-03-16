const BufferList = require('bl');

const iconv = require('iconv-lite');

const TinyInt = require('./data-types/tinyint');
const SmallInt = require('./data-types/smallint');
const Int = require('./data-types/int');
const BigInt = require('./data-types/bigint');
const IntN = require('./data-types/intn');
const Real = require('./data-types/real');
const Float = require('./data-types/float');
const FloatN = require('./data-types/floatn');
const SmallMoney = require('./data-types/smallmoney');
const Money = require('./data-types/money');
const MoneyN = require('./data-types/moneyn');
const Bit = require('./data-types/bit');
const BitN = require('./data-types/bitn');
const NChar = require('./data-types/nchar');
const NVarChar = require('./data-types/nvarchar');
const Char = require('./data-types/char');
const VarChar = require('./data-types/varchar');
const Binary = require('./data-types/binary');
const VarBinary = require('./data-types/varbinary');
const SmallDateTime = require('./data-types/smalldatetime');
const DateTime = require('./data-types/datetime');
const DateTimeN = require('./data-types/datetimen');
const DecimalN = require('./data-types/decimaln');
const NumericN = require('./data-types/numericn');
const Time = require('./data-types/time');
const Date = require('./data-types/date');
const DateTime2 = require('./data-types/datetime2');
const DateTimeOffset = require('./data-types/datetimeoffset');
const UniqueIdentifier = require('./data-types/uniqueidentifier');
const Image = require('./data-types/image');
const NText = require('./data-types/ntext');
const Text = require('./data-types/text');
const Variant = require('./data-types/sql-variant');

const NULL = 0xFFFF;
const MAX = 0xFFFF;
const PLP_NULL = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
const UNKNOWN_PLP_LEN = Buffer.from([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
const DEFAULT_ENCODING = 'utf8';

class NeedMoreBytes {
  constructor(offset) {
    this.offset = offset;
  }
}

class ParseResult {
  constructor(value, offset) {
    this.value = value;
    this.offset = offset;
  }
}

function parseTinyInt(buffer, offset) {
  if (buffer.length < offset + 1) {
    throw new NeedMoreBytes(offset + 1);
  }

  return new ParseResult(TinyInt.fromBuffer(buffer, offset), offset + 1);
}

function parseSmallInt(buffer, offset) {
  if (buffer.length < offset + 2) {
    throw new NeedMoreBytes(offset + 2);
  }

  return new ParseResult(SmallInt.fromBuffer(buffer, offset), offset + 2);
}

function parseInt(buffer, offset) {
  if (buffer.length < offset + 4) {
    throw new NeedMoreBytes(offset + 4);
  }

  return new ParseResult(Int.fromBuffer(buffer, offset), offset + 4);
}

function parseBigInt(buffer, offset) {
  if (buffer.length < offset + 8) {
    throw new NeedMoreBytes(offset + 8);
  }

  return new ParseResult(BigInt.fromBuffer(buffer, offset), offset + 8);
}

function parseIntN(buffer, offset) {
  if (buffer.length < offset + 1) {
    throw new NeedMoreBytes(offset + 1);
  }

  const dataLength = buffer.readUInt8(offset);

  switch (dataLength) {
    case 0:
      return new ParseResult(null, offset + 1);

    case 1:
      return parseTinyInt(buffer, offset + 1);

    case 2:
      return parseSmallInt(buffer, offset + 1);

    case 4:
      return parseInt(buffer, offset + 1);

    case 8:
      return parseBigInt(buffer, offset + 1);

    default:
      throw new Error('Unsupported dataLength ' + dataLength + ' for IntN');
  }
}

function parseReal(buffer, offset) {
  if (buffer.length < offset + 4) {
    throw new NeedMoreBytes(offset + 4);
  }

  return new ParseResult(Real.fromBuffer(buffer, offset), offset + 4);
}

function parseFloat(buffer, offset) {
  if (buffer.length < offset + 8) {
    throw new NeedMoreBytes(offset + 8);
  }

  return new ParseResult(Float.fromBuffer(buffer, offset), offset + 8);
}

function parseFloatN(buffer, offset) {
  if (buffer.length < offset + 1) {
    throw new NeedMoreBytes(offset + 1);
  }

  const dataLength = buffer.readUInt8(offset);

  switch (dataLength) {
    case 0:
      return new ParseResult(null, offset + 1);

    case 4:
      return parseReal(buffer, offset + 1);

    case 8:
      return parseFloat(buffer, offset + 1);

    default:
      throw new Error('Unsupported dataLength ' + dataLength + ' for FloatN');
  }
}

function parseSmallMoney(buffer, offset) {
  if (buffer.length < offset + 4) {
    throw new NeedMoreBytes(offset + 4);
  }

  return new ParseResult(SmallMoney.fromBuffer(buffer, offset), offset + 4);
}

function parseMoney(buffer, offset) {
  if (buffer.length < offset + 8) {
    throw new NeedMoreBytes(offset + 8);
  }

  return new ParseResult(Money.fromBuffer(buffer, offset), offset + 8);
}

function parseMoneyN(buffer, offset) {
  if (buffer.length < offset + 1) {
    throw new NeedMoreBytes(offset + 1);
  }

  const dataLength = buffer.readUInt8(offset);

  switch (dataLength) {
    case 0:
      return new ParseResult(null, offset + 1);

    case 4:
      return parseSmallMoney(buffer, offset + 1);

    case 8:
      return parseMoney(buffer, offset + 1);

    default:
      throw new Error('Unsupported dataLength ' + dataLength + ' for MoneyN');
  }
}

function parseBit(buffer, offset) {
  if (buffer.length < offset + 1) {
    throw new NeedMoreBytes(offset + 1);
  }

  return new ParseResult(Bit.fromBuffer(buffer, offset), offset + 1);
}

function parseBitN(buffer, offset) {
  if (buffer.length < offset + 1) {
    throw new NeedMoreBytes(offset + 1);
  }

  const dataLength = buffer.readUInt8(offset);

  switch (dataLength) {
    case 0:
      return new ParseResult(null, offset + 1);

    case 1:
      return parseBit(buffer, offset + 1);

    default:
      throw new Error('Unsupported dataLength ' + dataLength + ' for BitN');
  }
}

function parseNVarChar(buffer, offset) {
  if (buffer.length < offset + 2) {
    throw new NeedMoreBytes(offset + 2);
  }

  const dataLength = buffer.readUInt16LE(offset);
  offset += 2;

  if (dataLength === NULL) {
    return new ParseResult(null, offset);
  }

  if (buffer.length < offset + dataLength) {
    throw new NeedMoreBytes(offset + dataLength);
  }

  return new ParseResult(NChar.fromBuffer(buffer, offset, dataLength), offset + dataLength);
}

function parseVarChar(buffer, offset, metaData) {
  if (buffer.length < offset + 2) {
    throw new NeedMoreBytes(offset + 2);
  }

  const dataLength = buffer.readUInt16LE(offset);
  offset += 2;

  if (dataLength === NULL) {
    return new ParseResult(null, offset);
  }

  if (buffer.length < offset + dataLength) {
    throw new NeedMoreBytes(offset + dataLength);
  }

  return new ParseResult(Char.fromBuffer(buffer, offset, dataLength, metaData.collation.codepage), offset + dataLength);
}

function parseVarBinary(buffer, offset) {
  if (buffer.length < offset + 2) {
    throw new NeedMoreBytes(offset + 2);
  }

  const dataLength = buffer.readUInt16LE(offset);
  offset += 2;

  if (dataLength === NULL) {
    return new ParseResult(null, offset);
  }

  if (buffer.length < offset + dataLength) {
    throw new NeedMoreBytes(offset + dataLength);
  }

  return new ParseResult(Binary.fromBuffer(buffer, offset, dataLength), offset + dataLength);
}

function parseSmallDateTime(buffer, offset, metaData, options) {
  if (buffer.length < offset + 4) {
    throw new NeedMoreBytes(offset + 4);
  }

  return new ParseResult(SmallDateTime.fromBuffer(buffer, offset, options), offset + 4);
}

function parseDateTime(buffer, offset, metaData, options) {
  if (buffer.length < offset + 8) {
    throw new NeedMoreBytes(offset + 8);
  }

  return new ParseResult(DateTime.fromBuffer(buffer, offset, options), offset + 8);
}

function parseDateTimeN(buffer, offset, metaData, options) {
  if (buffer.length < offset + 1) {
    throw new NeedMoreBytes(offset + 1);
  }

  const dataLength = buffer.readUInt8(offset);

  switch (dataLength) {
    case 0:
      return new ParseResult(null, offset + 1);

    case 4:
      return parseSmallDateTime(buffer, offset + 1, metaData, options);

    case 8:
      return parseDateTime(buffer, offset + 1, metaData, options);

    default:
      throw new Error('Unsupported dataLength ' + dataLength + ' for DateTimeN');
  }
}

function parseDate(buffer, offset, metaData, options) {
  if (buffer.length < offset + 1) {
    throw new NeedMoreBytes(offset + 1);
  }

  const dataLength = buffer.readUInt8(offset);
  offset += 1;

  switch (dataLength) {
    case 0:
      return new ParseResult(null, offset);

    case 3:
      if (buffer.length < offset + 3) {
        throw new NeedMoreBytes(offset + 3);
      }

      return new ParseResult(Date.fromBuffer(buffer, offset, options), offset + 3);

    default:
      throw new Error('Unsupported dataLength ' + dataLength + ' for Date');
  }
}

function parseUniqueIdentifier(buffer, offset) {
  if (buffer.length < offset + 1) {
    throw new NeedMoreBytes(offset + 1);
  }

  const dataLength = buffer.readUInt8(offset);
  offset += 1;

  switch (dataLength) {
    case 0:
      return new ParseResult(null, offset);

    case 16:
      if (buffer.length < offset + 16) {
        throw new NeedMoreBytes(offset + 16);
      }

      return new ParseResult(UniqueIdentifier.fromBuffer(buffer, offset), offset + 16);

    default:
      throw new Error('Unsupported dataLength ' + dataLength + ' for UniqueIdentifier');
  }
}

function parseNumericN(buffer, offset, metaData) {
  if (buffer.length < offset + 1) {
    throw new NeedMoreBytes(offset + 1);
  }

  const dataLength = buffer.readUInt8(offset);
  offset += 1;

  switch (dataLength) {
    case 0:
      return new ParseResult(null, offset);

    default:
      if (buffer.length < offset + dataLength) {
        throw new NeedMoreBytes(offset + dataLength);
      }

      return new ParseResult(NumericN.fromBuffer(buffer, offset, dataLength, metaData.scale), offset + dataLength);
  }
}

function parseTime(buffer, offset, metaData, options) {
  if (buffer.length < offset + 1) {
    throw new NeedMoreBytes(offset + 1);
  }

  const dataLength = buffer.readUInt8(offset);
  offset += 1;

  switch (dataLength) {
    case 0:
      return new ParseResult(null, offset);

    default:
      if (buffer.length < offset + dataLength) {
        throw new NeedMoreBytes(offset + dataLength);
      }

      return new ParseResult(Time.fromBuffer(buffer, offset, metaData.scale, options), offset + dataLength);
  }
}

function parseDateTime2(buffer, offset, metaData, options) {
  if (buffer.length < offset + 1) {
    throw new NeedMoreBytes(offset + 1);
  }

  const dataLength = buffer.readUInt8(offset);
  offset += 1;

  switch (dataLength) {
    case 0:
      return new ParseResult(null, offset);

    default:
      if (buffer.length < offset + dataLength) {
        throw new NeedMoreBytes(offset + dataLength);
      }

      return new ParseResult(DateTime2.fromBuffer(buffer, offset, metaData.scale, options), offset + dataLength);
  }
}

function parseDateTimeOffset(buffer, offset, metaData, options) {
  if (buffer.length < offset + 1) {
    throw new NeedMoreBytes(offset + 1);
  }

  const dataLength = buffer.readUInt8(offset);
  offset += 1;

  switch (dataLength) {
    case 0:
      return new ParseResult(null, offset);

    default:
      if (buffer.length < offset + dataLength) {
        throw new NeedMoreBytes(offset + dataLength);
      }

      return new ParseResult(DateTimeOffset.fromBuffer(buffer, offset, metaData.scale, options), offset + dataLength);
  }
}

function parseVariant(buffer, offset, metaData, options) {
  if (buffer.length < offset + 4) {
    throw new NeedMoreBytes(offset + 4);
  }

  const dataLength = buffer.readUInt32LE(offset);
  offset += 4;

  switch (dataLength) {
    case 0:
      return new ParseResult(null, offset);

    default:
      if (buffer.length < offset + dataLength) {
        throw new NeedMoreBytes(offset + dataLength);
      }

      return new ParseResult(Variant.fromBuffer(buffer, offset, dataLength, options), offset + dataLength);
  }
}

function parseImage(buffer, offset) {
  if (buffer.length < offset + 1) {
    throw new NeedMoreBytes(offset + 1);
  }

  const textPointerLength = buffer.readUInt8(offset);
  offset += 1;

  if (textPointerLength === 0) {
    return new ParseResult(null, offset);
  }

  if (buffer.length < offset + 8 + textPointerLength) {
    throw new NeedMoreBytes(offset + 8 + textPointerLength);
  }

  offset += 8 + textPointerLength;

  const dataLength = buffer.readUInt32LE(offset);
  offset += 4;

  if (dataLength === PLP_NULL) {
    return new ParseResult(null, offset);
  }

  if (buffer.length < offset + dataLength) {
    throw new NeedMoreBytes(offset + dataLength);
  }

  return new ParseResult(Binary.fromBuffer(buffer, offset, dataLength), offset + dataLength);
}

function parseNText(buffer, offset) {
  if (buffer.length < offset + 1) {
    throw new NeedMoreBytes(offset + 1);
  }

  const textPointerLength = buffer.readUInt8(offset);
  offset += 1;

  if (textPointerLength === 0) {
    return new ParseResult(null, offset);
  }

  if (buffer.length < offset + 8 + textPointerLength) {
    throw new NeedMoreBytes(offset + 8 + textPointerLength);
  }

  offset += 8 + textPointerLength;

  const dataLength = buffer.readUInt32LE(offset);
  offset += 4;

  if (dataLength === PLP_NULL) {
    return new ParseResult(null, offset);
  }

  if (buffer.length < offset + dataLength) {
    throw new NeedMoreBytes(offset + dataLength);
  }

  return new ParseResult(NChar.fromBuffer(buffer, offset, dataLength), offset + dataLength);
}

function parseText(buffer, offset, metaData) {
  if (buffer.length < offset + 1) {
    throw new NeedMoreBytes(offset + 1);
  }

  const textPointerLength = buffer.readUInt8(offset);
  offset += 1;

  if (textPointerLength === 0) {
    return new ParseResult(null, offset);
  }

  if (buffer.length < offset + 8 + textPointerLength) {
    throw new NeedMoreBytes(offset + 8 + textPointerLength);
  }

  offset += 8 + textPointerLength;

  const dataLength = buffer.readUInt32LE(offset);
  offset += 4;

  if (dataLength === PLP_NULL) {
    return new ParseResult(null, offset);
  }

  if (buffer.length < offset + dataLength) {
    throw new NeedMoreBytes(offset + dataLength);
  }

  return new ParseResult(Char.fromBuffer(buffer, offset, dataLength, metaData.collation.codepage), offset + dataLength);
}

const parseMap = {
  [TinyInt.id]: parseTinyInt,
  [SmallInt.id]: parseSmallInt,
  [Int.id]: parseInt,
  [BigInt.id]: parseBigInt,
  [IntN.id]: parseIntN,
  [Real.id]: parseReal,
  [Float.id]: parseFloat,
  [FloatN.id]: parseFloatN,
  [SmallMoney.id]: parseSmallMoney,
  [Money.id]: parseMoney,
  [MoneyN.id]: parseMoneyN,
  [Bit.id]: parseBit,
  [BitN.id]: parseBitN,
  [NChar.id]: parseNVarChar,
  [NVarChar.id]: parseNVarChar,
  [Char.id]: parseVarChar,
  [VarChar.id]: parseVarChar,
  [Binary.id]: parseVarBinary,
  [VarBinary.id]: parseVarBinary,
  [SmallDateTime.id]: parseSmallDateTime,
  [DateTime.id]: parseDateTime,
  [DateTimeN.id]: parseDateTimeN,
  [NumericN.id]: parseNumericN,
  [DecimalN.id]: parseNumericN,
  [Time.id]: parseTime,
  [Date.id]: parseDate,
  [DateTime2.id]: parseDateTime2,
  [DateTimeOffset.id]: parseDateTimeOffset,
  [UniqueIdentifier.id]: parseUniqueIdentifier,
  [Variant.id]: parseVariant,
  [Image.id]: parseImage,
  [NText.id]: parseNText,
  [Text.id]: parseText,
};

module.exports = valueParse;
function valueParse(parser, metaData, options, callback) {
  const type = metaData.type;

  switch (type.name) {
    case 'VarChar':
      if (metaData.dataLength === MAX) {
        return readMaxChars(parser, metaData.collation.codepage, callback);
      }
      break;

    case 'NVarChar':
      if (metaData.dataLength === MAX) {
        return readMaxNChars(parser, callback);
      }
      break;

    case 'VarBinary':
      if (metaData.dataLength === MAX) {
        return readMaxBinary(parser, callback);
      }
      break;

    case 'UDT':
      return readMaxBinary(parser, callback);

    case 'Xml':
      return readMaxNChars(parser, callback);
  }

  if (parseMap[type.id]) {
    let value, offset;

    try {
      ({ value, offset } = parseMap[type.id](parser.buffer, parser.position, metaData, options));
    } catch (err) {
      if (!(err instanceof NeedMoreBytes)) {
        throw err;
      }

      return parser.awaitData(err.offset - parser.position, () => {
        valueParse(parser, metaData, options, callback);
      });
    }

    parser.position = offset;
    return callback(value);
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

const { Transform } = require('readable-stream');

class PLPStream extends Transform {
  constructor(expectedLength) {
    super();

    this.expectedLength = expectedLength;
    this.receivedLength = 0;
  }

  _transform(chunk, encoding, callback) {
    this.receivedLength += chunk.length;
    callback(null, chunk);
  }

  _flush(callback) {
    if (this.expectedLength !== undefined && this.receivedLength !== this.expectedLength) {
      callback(new Error('Partially Length-prefixed Bytes unmatched lengths : expected ' + this.expectedLength + ', but got ' + this.receivedLength + ' bytes'));
    } else {
      callback();
    }
  }
}

function readMax(parser, callback) {
  if (parser.buffer.length < parser.position + 8) {
    return parser.awaitData(8, () => {
      readMax(parser, callback);
    });
  }

  const low = parser.buffer.readUInt32LE(parser.position);
  const high = parser.buffer.readUInt32LE(parser.position + 4);
  parser.position += 8;

  let stream;
  if (low === 0xFFFFFFFE && high === 0xFFFFFFFF) {
    stream = new PLPStream();
  } else {
    if (high >= (2 << (53 - 32))) {
      console.warn('Read UInt64LE > 53 bits : high=' + high + ', low=' + low);
    }

    const expectedLength = low + (0x100000000 * high);
    stream = new PLPStream(expectedLength);
  }

  stream.pipe(new BufferList((err, data) => {
    callback(data);
  }));

  readPLPStream(parser, stream);
}

function readPLPStream(parser, stream) {
  if (parser.buffer.length < parser.position + 4) {
    return parser.awaitData(4, () => {
      readPLPStream(parser, stream);
    });
  }

  const chunkLength = parser.buffer.readUInt32LE(parser.position);

  if (!chunkLength) {
    parser.position += 4;
    return stream.end();
  }

  if (parser.buffer.length < parser.position + 4 + chunkLength) {
    return parser.awaitData(4 + chunkLength, () => {
      readPLPStream(parser, stream);
    });
  }

  stream.write(parser.buffer.slice(parser.position += 4, parser.position += chunkLength));

  readPLPStream(parser, stream);
}
