'use strict';

var Parser, WritableTrackingBuffer, dataTypeByName, options;

Parser = require('../../../src/token/stream-parser');

dataTypeByName = require('../../../src/data-type').typeByName;

WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer;

options = {
  useUTC: false,
  tdsVersion: '7_2'
};

module.exports['null'] = function(test) {
  var buffer, colMetaData, parser, token;
  colMetaData = [
    {
      type: dataTypeByName.Null
    }
  ];
  buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xD1);
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, null);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);
  return test.done();
};

module.exports.int = function(test) {
  var buffer, colMetaData, parser, token, value;
  colMetaData = [
    {
      type: dataTypeByName.Int
    }
  ];
  value = 3;
  buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xD1);
  buffer.writeUInt32LE(value);
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);
  return test.done();
};

module.exports.bigint = function(test) {
  var buffer, colMetaData, parser, token;
  colMetaData = [
    {
      type: dataTypeByName.BigInt
    }, {
      type: dataTypeByName.BigInt
    }
  ];
  buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xD1);
  buffer.writeBuffer(new Buffer([1, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 127]));
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 2);
  test.strictEqual('1', token.columns[0].value);
  test.strictEqual('9223372036854775807', token.columns[1].value);
  return test.done();
};

module.exports.real = function(test) {
  var buffer, colMetaData, parser, token, value;
  colMetaData = [
    {
      type: dataTypeByName.Real
    }
  ];
  value = 9.5;
  buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xD1);
  buffer.writeBuffer(new Buffer([0x00, 0x00, 0x18, 0x41]));
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);
  return test.done();
};

module.exports.float = function(test) {
  var buffer, colMetaData, parser, token, value;
  colMetaData = [
    {
      type: dataTypeByName.Float
    }
  ];
  value = 9.5;
  buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xD1);
  buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x23, 0x40]));
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);
  return test.done();
};

module.exports.money = function(test) {
  var buffer, colMetaData, parser, token, value, valueLarge;
  colMetaData = [
    {
      type: dataTypeByName.SmallMoney
    }, {
      type: dataTypeByName.Money
    }, {
      type: dataTypeByName.MoneyN
    }, {
      type: dataTypeByName.MoneyN
    }, {
      type: dataTypeByName.MoneyN
    }, {
      type: dataTypeByName.MoneyN
    }
  ];
  value = 123.456;
  valueLarge = 123456789012345.11;
  buffer = new WritableTrackingBuffer(0);
  buffer.writeUInt8(0xD1);
  buffer.writeBuffer(new Buffer([0x80, 0xd6, 0x12, 0x00]));
  buffer.writeBuffer(new Buffer([0x00, 0x00, 0x00, 0x00, 0x80, 0xd6, 0x12, 0x00]));
  buffer.writeBuffer(new Buffer([0x00]));
  buffer.writeBuffer(new Buffer([0x04, 0x80, 0xd6, 0x12, 0x00]));
  buffer.writeBuffer(new Buffer([0x08, 0x00, 0x00, 0x00, 0x00, 0x80, 0xd6, 0x12, 0x00]));
  buffer.writeBuffer(new Buffer([0x08, 0xf4, 0x10, 0x22, 0x11, 0xdc, 0x6a, 0xe9, 0x7d]));
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 6);
  test.strictEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[1].value, value);
  test.strictEqual(token.columns[2].value, null);
  test.strictEqual(token.columns[3].value, value);
  test.strictEqual(token.columns[4].value, value);
  test.strictEqual(token.columns[5].value, valueLarge);
  return test.done();
};

module.exports.varCharWithoutCodepage = function(test) {
  var buffer, colMetaData, parser, token, value;
  colMetaData = [
    {
      type: dataTypeByName.VarChar,
      collation: {
        codepage: void 0
      }
    }
  ];
  value = 'abcde';
  buffer = new WritableTrackingBuffer(0, 'ascii');
  buffer.writeUInt8(0xD1);
  buffer.writeUsVarchar(value);
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);
  return test.done();
};

module.exports.varCharWithCodepage = function(test) {
  var buffer, colMetaData, parser, token, value;
  colMetaData = [
    {
      type: dataTypeByName.VarChar,
      collation: {
        codepage: 'WINDOWS-1252'
      }
    }
  ];
  value = 'abcdé';
  buffer = new WritableTrackingBuffer(0, 'ascii');
  buffer.writeUInt8(0xD1);
  buffer.writeUsVarchar(value);
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);
  return test.done();
};

module.exports.nVarChar = function(test) {
  var buffer, colMetaData, parser, token, value;
  colMetaData = [
    {
      type: dataTypeByName.NVarChar
    }
  ];
  value = 'abc';
  buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xD1);
  buffer.writeUInt16LE(value.length * 2);
  buffer.writeString(value);
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);
  return test.done();
};

module.exports.varBinary = function(test) {
  var buffer, colMetaData, parser, token, value;
  colMetaData = [
    {
      type: dataTypeByName.VarBinary
    }
  ];
  value = new Buffer([0x12, 0x34]);
  buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xD1);
  buffer.writeUInt16LE(value.length);
  buffer.writeBuffer(new Buffer(value));
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.deepEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);
  return test.done();
};

module.exports.binary = function(test) {
  var buffer, colMetaData, parser, token, value;
  colMetaData = [
    {
      type: dataTypeByName.Binary
    }
  ];
  value = new Buffer([0x12, 0x34]);
  buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xD1);
  buffer.writeUInt16LE(value.length);
  buffer.writeBuffer(new Buffer(value));
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.deepEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);
  return test.done();
};

module.exports.varCharMaxNull = function(test) {
  var buffer, colMetaData, parser, token;
  colMetaData = [
    {
      type: dataTypeByName.VarChar,
      dataLength: 65535,
      collation: {
        codepage: void 0
      }
    }
  ];
  buffer = new WritableTrackingBuffer(0, 'ascii');
  buffer.writeUInt8(0xD1);
  buffer.writeBuffer(new Buffer([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, null);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);
  return test.done();
};

module.exports.varCharMaxUnknownLength = function(test) {
  var buffer, colMetaData, parser, token, value;
  colMetaData = [
    {
      type: dataTypeByName.VarChar,
      dataLength: 65535,
      collation: {
        codepage: void 0
      }
    }
  ];
  value = 'abcdef';
  buffer = new WritableTrackingBuffer(0, 'ascii');
  buffer.writeUInt8(0xD1);
  buffer.writeBuffer(new Buffer([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
  buffer.writeUInt32LE(3);
  buffer.writeString(value.slice(0, 3));
  buffer.writeUInt32LE(3);
  buffer.writeString(value.slice(3, 6));
  buffer.writeUInt32LE(0);
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);
  return test.done();
};

module.exports.varCharMaxKnownLength = function(test) {
  var buffer, colMetaData, parser, token, value;
  colMetaData = [
    {
      type: dataTypeByName.VarChar,
      dataLength: 65535,
      collation: {
        codepage: void 0
      }
    }
  ];
  value = 'abcdef';
  buffer = new WritableTrackingBuffer(0, 'ascii');
  buffer.writeUInt8(0xD1);
  buffer.writeUInt64LE(value.length);
  buffer.writeUInt32LE(3);
  buffer.writeString(value.slice(0, 3));
  buffer.writeUInt32LE(3);
  buffer.writeString(value.slice(3, 6));
  buffer.writeUInt32LE(0);
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);
  return test.done();
};

module.exports.varCharMaxWithCodepage = function(test) {
  var buffer, colMetaData, parser, token, value;
  colMetaData = [
    {
      type: dataTypeByName.VarChar,
      dataLength: 65535,
      collation: {
        codepage: 'WINDOWS-1252'
      }
    }
  ];
  value = 'abcdéf';
  buffer = new WritableTrackingBuffer(0, 'ascii');
  buffer.writeUInt8(0xD1);
  buffer.writeUInt64LE(value.length);
  buffer.writeUInt32LE(3);
  buffer.writeString(value.slice(0, 3));
  buffer.writeUInt32LE(3);
  buffer.writeString(value.slice(3, 6));
  buffer.writeUInt32LE(0);
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);
  return test.done();
};

module.exports.varCharMaxKnownLengthWrong = function(test) {
  var buffer, colMetaData, parser, value;
  colMetaData = [
    {
      type: dataTypeByName.VarChar,
      dataLength: 65535
    }
  ];
  value = 'abcdef';
  buffer = new WritableTrackingBuffer(0, 'ascii');
  buffer.writeUInt8(0xD1);
  buffer.writeUInt64LE(value.length + 1);
  buffer.writeUInt32LE(3);
  buffer.writeString(value.slice(0, 3));
  buffer.writeUInt32LE(3);
  buffer.writeString(value.slice(3, 6));
  buffer.writeUInt32LE(0);
  try {
    parser = new Parser({
      token: function() {}
    }, colMetaData, options);
    parser.write(buffer.data);
    parser.read();
    test.ok(false);
  } catch (error) {
    test.done();
  }
};

module.exports.varBinaryMaxNull = function(test) {
  var buffer, colMetaData, parser, token;
  colMetaData = [
    {
      type: dataTypeByName.VarBinary,
      dataLength: 65535
    }
  ];
  buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xD1);
  buffer.writeBuffer(new Buffer([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, null);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);
  return test.done();
};

module.exports.varBinaryMaxUnknownLength = function(test) {
  var buffer, colMetaData, parser, token, value;
  colMetaData = [
    {
      type: dataTypeByName.VarBinary,
      dataLength: 65535
    }
  ];
  value = new Buffer([0x12, 0x34, 0x56, 0x78]);
  buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xD1);
  buffer.writeBuffer(new Buffer([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
  buffer.writeUInt32LE(2);
  buffer.writeBuffer(new Buffer(value.slice(0, 2)));
  buffer.writeUInt32LE(2);
  buffer.writeBuffer(new Buffer(value.slice(2, 4)));
  buffer.writeUInt32LE(0);
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.deepEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);
  return test.done();
};

module.exports.intN = function(test) {
  var buffer, colMetaData, parser, token;
  colMetaData = [
    {
      type: dataTypeByName.IntN
    }, {
      type: dataTypeByName.IntN
    }, {
      type: dataTypeByName.IntN
    }, {
      type: dataTypeByName.IntN
    }, {
      type: dataTypeByName.IntN
    }, {
      type: dataTypeByName.IntN
    }, {
      type: dataTypeByName.IntN
    }, {
      type: dataTypeByName.IntN
    }, {
      type: dataTypeByName.IntN
    }, {
      type: dataTypeByName.IntN
    }, {
      type: dataTypeByName.IntN
    }, {
      type: dataTypeByName.IntN
    }
  ];
  buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xD1);
  buffer.writeBuffer(new Buffer([0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 8, 1, 0, 0, 0, 0, 0, 0, 0, 8, 255, 255, 255, 255, 255, 255, 255, 255, 8, 2, 0, 0, 0, 0, 0, 0, 0, 8, 254, 255, 255, 255, 255, 255, 255, 255, 8, 255, 255, 255, 255, 255, 255, 255, 127, 8, 0, 0, 0, 0, 0, 0, 0, 128, 8, 10, 0, 0, 0, 0, 0, 0, 0, 8, 100, 0, 0, 0, 0, 0, 0, 0, 8, 232, 3, 0, 0, 0, 0, 0, 0, 8, 16, 39, 0, 0, 0, 0, 0, 0]));
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 12);
  test.strictEqual(token.columns[0].value, null);
  test.strictEqual('0', token.columns[1].value);
  test.strictEqual('1', token.columns[2].value);
  test.strictEqual('-1', token.columns[3].value);
  test.strictEqual('2', token.columns[4].value);
  test.strictEqual('-2', token.columns[5].value);
  test.strictEqual('9223372036854775807', token.columns[6].value);
  test.strictEqual('-9223372036854775808', token.columns[7].value);
  test.strictEqual('10', token.columns[8].value);
  test.strictEqual('100', token.columns[9].value);
  test.strictEqual('1000', token.columns[10].value);
  test.strictEqual('10000', token.columns[11].value);
  return test.done();
};

module.exports.guidN = function(test) {
  var buffer, colMetaData, parser, token;
  colMetaData = [
    {
      type: dataTypeByName.UniqueIdentifierN
    }, {
      type: dataTypeByName.UniqueIdentifierN
    }
  ];
  buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xD1);
  buffer.writeBuffer(new Buffer([0, 16, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef]));
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 2);
  test.strictEqual(token.columns[0].value, null);
  test.deepEqual('67452301-AB89-EFCD-0123-456789ABCDEF', token.columns[1].value);
  return test.done();
};

module.exports.floatN = function(test) {
  var buffer, colMetaData, parser, token;
  colMetaData = [
    {
      type: dataTypeByName.FloatN
    }, {
      type: dataTypeByName.FloatN
    }, {
      type: dataTypeByName.FloatN
    }
  ];
  buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xD1);
  buffer.writeBuffer(new Buffer([0, 4, 0x00, 0x00, 0x18, 0x41, 8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x23, 0x40]));
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 3);
  test.strictEqual(token.columns[0].value, null);
  test.strictEqual(9.5, token.columns[1].value);
  test.strictEqual(9.5, token.columns[2].value);
  return test.done();
};

module.exports.datetime = function(test) {
  var buffer, colMetaData, days, parser, threeHundredthsOfSecond, token;
  colMetaData = [
    {
      type: dataTypeByName.DateTime
    }
  ];
  days = 2;
  threeHundredthsOfSecond = 45 * 300;
  buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xD1);
  buffer.writeInt32LE(days);
  buffer.writeUInt32LE(threeHundredthsOfSecond);
  parser = new Parser({
    token: function() {}
  }, colMetaData, {
    useUTC: false
  });
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value.getTime(), new Date('January 3, 1900 00:00:45').getTime());
  parser = new Parser({
    token: function() {}
  }, colMetaData, {
    useUTC: true
  });
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value.getTime(), new Date('January 3, 1900 00:00:45 GMT').getTime());
  return test.done();
};

module.exports.datetimeN = function(test) {
  var buffer, colMetaData, parser, token;
  colMetaData = [
    {
      type: dataTypeByName.DateTimeN
    }
  ];
  buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xD1);
  buffer.writeUInt8(0);
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, null);
  return test.done();
};

module.exports.numeric4Bytes = function(test) {
  var buffer, colMetaData, parser, token, value;
  colMetaData = [
    {
      type: dataTypeByName.NumericN,
      precision: 3,
      scale: 1
    }
  ];
  value = 9.3;
  buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xD1);
  buffer.writeUInt8(1 + 4);
  buffer.writeUInt8(1);
  buffer.writeUInt32LE(93);
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  return test.done();
};

module.exports.numeric4BytesNegative = function(test) {
  var buffer, colMetaData, parser, token, value;
  colMetaData = [
    {
      type: dataTypeByName.NumericN,
      precision: 3,
      scale: 1
    }
  ];
  value = -9.3;
  buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xD1);
  buffer.writeUInt8(1 + 4);
  buffer.writeUInt8(0);
  buffer.writeUInt32LE(93);
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  return test.done();
};

module.exports.numeric8Bytes = function(test) {
  var buffer, colMetaData, parser, token, value;
  colMetaData = [
    {
      type: dataTypeByName.NumericN,
      precision: 13,
      scale: 1
    }
  ];
  value = (0x100000000 + 93) / 10;
  buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xD1);
  buffer.writeUInt8(1 + 8);
  buffer.writeUInt8(1);
  buffer.writeUInt32LE(93);
  buffer.writeUInt32LE(1);
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  return test.done();
};

module.exports.numeric12Bytes = function(test) {
  var buffer, colMetaData, parser, token, value;
  colMetaData = [
    {
      type: dataTypeByName.NumericN,
      precision: 23,
      scale: 1
    }
  ];
  value = ((0x100000000 * 0x100000000) + 0x200000000 + 93) / 10;
  buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xD1);
  buffer.writeUInt8(1 + 12);
  buffer.writeUInt8(1);
  buffer.writeUInt32LE(93);
  buffer.writeUInt32LE(2);
  buffer.writeUInt32LE(1);
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  return test.done();
};

module.exports.numeric16Bytes = function(test) {
  var buffer, colMetaData, parser, token, value;
  colMetaData = [
    {
      type: dataTypeByName.NumericN,
      precision: 33,
      scale: 1
    }
  ];
  value = ((0x100000000 * 0x100000000 * 0x100000000) + (0x200000000 * 0x100000000) + 0x300000000 + 93) / 10;
  buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xD1);
  buffer.writeUInt8(1 + 16);
  buffer.writeUInt8(1);
  buffer.writeUInt32LE(93);
  buffer.writeUInt32LE(3);
  buffer.writeUInt32LE(2);
  buffer.writeUInt32LE(1);
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  return test.done();
};

module.exports.numericNull = function(test) {
  var buffer, colMetaData, parser, token;
  colMetaData = [
    {
      type: dataTypeByName.NumericN,
      precision: 3,
      scale: 1
    }
  ];
  buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xD1);
  buffer.writeUInt8(0);
  parser = new Parser({
    token: function() {}
  }, colMetaData, options);
  parser.write(buffer.data);
  token = parser.read();
  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, null);
  return test.done();
};
