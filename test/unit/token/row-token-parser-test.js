var Parser = require('../../../src/token/stream-parser');
var dataTypeByName = require('../../../src/data-type').typeByName;
var WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer')
  .WritableTrackingBuffer;
var options = {
  useUTC: false,
  tdsVersion: '7_2'
};

module.exports.dbnull = function(test) {
  var colMetaData = [{ type: dataTypeByName.Null }];

  var buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xd1);

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();

  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, null);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);

  return test.done();
};

module.exports.int = function(test) {
  var colMetaData = [{ type: dataTypeByName.Int }];
  var value = 3;

  var buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xd1);
  buffer.writeUInt32LE(value);

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();

  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);

  return test.done();
};

module.exports.bigint = function(test) {
  var colMetaData = [
    { type: dataTypeByName.BigInt },
    { type: dataTypeByName.BigInt }
  ];

  var buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xd1);
  buffer.writeBuffer(
    new Buffer([1, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 127])
  );

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 2);
  test.strictEqual('1', token.columns[0].value);
  test.strictEqual('9223372036854775807', token.columns[1].value);

  return test.done();
};

module.exports.real = function(test) {
  var colMetaData = [{ type: dataTypeByName.Real }];
  var value = 9.5;

  var buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xd1);
  buffer.writeBuffer(new Buffer([0x00, 0x00, 0x18, 0x41]));

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);

  return test.done();
};

module.exports.float = function(test) {
  var colMetaData = [{ type: dataTypeByName.Float }];
  var value = 9.5;

  var buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xd1);
  buffer.writeBuffer(
    new Buffer([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x23, 0x40])
  );

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);

  return test.done();
};

module.exports.money = function(test) {
  var colMetaData = [
    { type: dataTypeByName.SmallMoney },
    { type: dataTypeByName.Money },
    { type: dataTypeByName.MoneyN },
    { type: dataTypeByName.MoneyN },
    { type: dataTypeByName.MoneyN },
    { type: dataTypeByName.MoneyN }
  ];
  var value = 123.456;
  var valueLarge = 123456789012345.11;

  var buffer = new WritableTrackingBuffer(0);
  buffer.writeUInt8(0xd1);
  buffer.writeBuffer(new Buffer([0x80, 0xd6, 0x12, 0x00]));
  buffer.writeBuffer(
    new Buffer([0x00, 0x00, 0x00, 0x00, 0x80, 0xd6, 0x12, 0x00])
  );
  buffer.writeBuffer(new Buffer([0x00]));
  buffer.writeBuffer(new Buffer([0x04, 0x80, 0xd6, 0x12, 0x00]));
  buffer.writeBuffer(
    new Buffer([0x08, 0x00, 0x00, 0x00, 0x00, 0x80, 0xd6, 0x12, 0x00])
  );
  buffer.writeBuffer(
    new Buffer([0x08, 0xf4, 0x10, 0x22, 0x11, 0xdc, 0x6a, 0xe9, 0x7d])
  );

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

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
  var colMetaData = [
    {
      type: dataTypeByName.VarChar,
      collation: {
        codepage: undefined
      }
    }
  ];
  var value = 'abcde';

  var buffer = new WritableTrackingBuffer(0, 'ascii');
  buffer.writeUInt8(0xd1);
  buffer.writeUsVarchar(value);
  //console.log(buffer.data)

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);

  return test.done();
};

module.exports.varCharWithCodepage = function(test) {
  var colMetaData = [
    {
      type: dataTypeByName.VarChar,
      collation: {
        codepage: 'WINDOWS-1252'
      }
    }
  ];
  var value = 'abcdé';

  var buffer = new WritableTrackingBuffer(0, 'ascii');
  buffer.writeUInt8(0xd1);
  buffer.writeUsVarchar(value);
  //console.log(buffer.data)

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);

  return test.done();
};

module.exports.nVarChar = function(test) {
  var colMetaData = [{ type: dataTypeByName.NVarChar }];
  var value = 'abc';

  var buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xd1);
  buffer.writeUInt16LE(value.length * 2);
  buffer.writeString(value);
  //console.log(buffer.data)

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);

  return test.done();
};

module.exports.varBinary = function(test) {
  var colMetaData = [{ type: dataTypeByName.VarBinary }];
  var value = new Buffer([0x12, 0x34]);

  var buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xd1);
  buffer.writeUInt16LE(value.length);
  buffer.writeBuffer(new Buffer(value));
  //console.log(buffer.data)

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 1);
  test.deepEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);

  return test.done();
};

module.exports.binary = function(test) {
  var colMetaData = [{ type: dataTypeByName.Binary }];
  var value = new Buffer([0x12, 0x34]);

  var buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xd1);
  buffer.writeUInt16LE(value.length);
  buffer.writeBuffer(new Buffer(value));
  //console.log(buffer.data)

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 1);
  test.deepEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);

  return test.done();
};

module.exports.varCharMaxNull = function(test) {
  var colMetaData = [
    {
      type: dataTypeByName.VarChar,
      dataLength: 65535,
      collation: {
        codepage: undefined
      }
    }
  ];

  var buffer = new WritableTrackingBuffer(0, 'ascii');
  buffer.writeUInt8(0xd1);
  buffer.writeBuffer(
    new Buffer([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
  );
  //console.log(buffer.data)

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, null);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);

  return test.done();
};

module.exports.varCharMaxUnknownLength = function(test) {
  var colMetaData = [
    {
      type: dataTypeByName.VarChar,
      dataLength: 65535,
      collation: {
        codepage: undefined
      }
    }
  ];
  var value = 'abcdef';

  var buffer = new WritableTrackingBuffer(0, 'ascii');
  buffer.writeUInt8(0xd1);
  buffer.writeBuffer(
    new Buffer([0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
  );
  buffer.writeUInt32LE(3);
  buffer.writeString(value.slice(0, 3));
  buffer.writeUInt32LE(3);
  buffer.writeString(value.slice(3, 6));
  buffer.writeUInt32LE(0);
  //console.log(buffer.data)

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);

  return test.done();
};

module.exports.varCharMaxKnownLength = function(test) {
  var colMetaData = [
    {
      type: dataTypeByName.VarChar,
      dataLength: 65535,
      collation: {
        codepage: undefined
      }
    }
  ];
  var value = 'abcdef';

  var buffer = new WritableTrackingBuffer(0, 'ascii');
  buffer.writeUInt8(0xd1);
  buffer.writeUInt64LE(value.length);
  buffer.writeUInt32LE(3);
  buffer.writeString(value.slice(0, 3));
  buffer.writeUInt32LE(3);
  buffer.writeString(value.slice(3, 6));
  buffer.writeUInt32LE(0);
  //console.log(buffer.data)

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);

  return test.done();
};

module.exports.varCharMaxWithCodepage = function(test) {
  var colMetaData = [
    {
      type: dataTypeByName.VarChar,
      dataLength: 65535,
      collation: {
        codepage: 'WINDOWS-1252'
      }
    }
  ];
  var value = 'abcdéf';

  var buffer = new WritableTrackingBuffer(0, 'ascii');
  buffer.writeUInt8(0xd1);
  buffer.writeUInt64LE(value.length);
  buffer.writeUInt32LE(3);
  buffer.writeString(value.slice(0, 3));
  buffer.writeUInt32LE(3);
  buffer.writeString(value.slice(3, 6));
  buffer.writeUInt32LE(0);
  //console.log(buffer.data)

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);

  return test.done();
};

module.exports.varCharMaxKnownLengthWrong = function(test) {
  var colMetaData = [
    {
      type: dataTypeByName.VarChar,
      dataLength: 65535
    }
  ];
  var value = 'abcdef';

  var buffer = new WritableTrackingBuffer(0, 'ascii');
  buffer.writeUInt8(0xd1);
  buffer.writeUInt64LE(value.length + 1);
  buffer.writeUInt32LE(3);
  buffer.writeString(value.slice(0, 3));
  buffer.writeUInt32LE(3);
  buffer.writeString(value.slice(3, 6));
  buffer.writeUInt32LE(0);
  //console.log(buffer.data)

  try {
    var parser = new Parser({ token() {} }, colMetaData, options);
    parser.write(buffer.data);
    /* eslint-disable */
    var token = parser.read();
    /* eslint-enable */
    return test.ok(false);
  } catch (exception) {
    return test.done();
  }
};

module.exports.varBinaryMaxNull = function(test) {
  var colMetaData = [
    {
      type: dataTypeByName.VarBinary,
      dataLength: 65535
    }
  ];

  var buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xd1);
  buffer.writeBuffer(
    new Buffer([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
  );
  //console.log(buffer.data)

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, null);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);

  return test.done();
};

module.exports.varBinaryMaxUnknownLength = function(test) {
  var colMetaData = [
    {
      type: dataTypeByName.VarBinary,
      dataLength: 65535
    }
  ];
  var value = new Buffer([0x12, 0x34, 0x56, 0x78]);

  var buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xd1);
  buffer.writeBuffer(
    new Buffer([0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
  );
  buffer.writeUInt32LE(2);
  buffer.writeBuffer(new Buffer(value.slice(0, 2)));
  buffer.writeUInt32LE(2);
  buffer.writeBuffer(new Buffer(value.slice(2, 4)));
  buffer.writeUInt32LE(0);
  //console.log(buffer.data)

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 1);
  test.deepEqual(token.columns[0].value, value);
  test.strictEqual(token.columns[0].metadata, colMetaData[0]);

  return test.done();
};

module.exports.intN = function(test) {
  var colMetaData = [
    { type: dataTypeByName.IntN },
    { type: dataTypeByName.IntN },
    { type: dataTypeByName.IntN },
    { type: dataTypeByName.IntN },
    { type: dataTypeByName.IntN },
    { type: dataTypeByName.IntN },
    { type: dataTypeByName.IntN },
    { type: dataTypeByName.IntN },
    { type: dataTypeByName.IntN },
    { type: dataTypeByName.IntN },
    { type: dataTypeByName.IntN },
    { type: dataTypeByName.IntN }
  ];

  var buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xd1);
  buffer.writeBuffer(
    new Buffer([
      0,
      8,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      8,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      8,
      255,
      255,
      255,
      255,
      255,
      255,
      255,
      255,
      8,
      2,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      8,
      254,
      255,
      255,
      255,
      255,
      255,
      255,
      255,
      8,
      255,
      255,
      255,
      255,
      255,
      255,
      255,
      127,
      8,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      128,
      8,
      10,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      8,
      100,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      8,
      232,
      3,
      0,
      0,
      0,
      0,
      0,
      0,
      8,
      16,
      39,
      0,
      0,
      0,
      0,
      0,
      0
    ])
  );
  //console.log(buffer.data)

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

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
  var colMetaData = [
    { type: dataTypeByName.UniqueIdentifierN },
    { type: dataTypeByName.UniqueIdentifierN }
  ];

  var buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xd1);
  buffer.writeBuffer(
    new Buffer([
      0,
      16,
      0x01,
      0x23,
      0x45,
      0x67,
      0x89,
      0xab,
      0xcd,
      0xef,
      0x01,
      0x23,
      0x45,
      0x67,
      0x89,
      0xab,
      0xcd,
      0xef
    ])
  );
  // console.log(buffer.data)

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 2);
  test.strictEqual(token.columns[0].value, null);
  test.deepEqual(
    '67452301-AB89-EFCD-0123-456789ABCDEF',
    token.columns[1].value
  );

  return test.done();
};

module.exports.floatN = function(test) {
  var colMetaData = [
    { type: dataTypeByName.FloatN },
    { type: dataTypeByName.FloatN },
    { type: dataTypeByName.FloatN }
  ];

  var buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xd1);
  buffer.writeBuffer(
    new Buffer([
      0,
      4,
      0x00,
      0x00,
      0x18,
      0x41,
      8,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x23,
      0x40
    ])
  );
  //console.log(buffer.data)

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 3);
  test.strictEqual(token.columns[0].value, null);
  test.strictEqual(9.5, token.columns[1].value);
  test.strictEqual(9.5, token.columns[2].value);

  return test.done();
};

module.exports.datetime = function(test) {
  var colMetaData = [{ type: dataTypeByName.DateTime }];

  var days = 2; // 3rd January 1900
  var threeHundredthsOfSecond = 45 * 300; // 45 seconds

  var buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xd1);

  buffer.writeInt32LE(days);
  buffer.writeUInt32LE(threeHundredthsOfSecond);
  //console.log(buffer)

  var parser = new Parser({ token() {} }, colMetaData, { useUTC: false });
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 1);
  test.strictEqual(
    token.columns[0].value.getTime(),
    new Date('January 3, 1900 00:00:45').getTime()
  );

  parser = new Parser({ token() {} }, colMetaData, { useUTC: true });
  parser.write(buffer.data);
  token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 1);
  test.strictEqual(
    token.columns[0].value.getTime(),
    new Date('January 3, 1900 00:00:45 GMT').getTime()
  );

  return test.done();
};

module.exports.datetimeN = function(test) {
  var colMetaData = [{ type: dataTypeByName.DateTimeN }];

  var buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xd1);

  buffer.writeUInt8(0);
  //console.log(buffer)

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, null);

  return test.done();
};

module.exports.numeric4Bytes = function(test) {
  var colMetaData = [
    {
      type: dataTypeByName.NumericN,
      precision: 3,
      scale: 1
    }
  ];

  var value = 9.3;

  var buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xd1);

  buffer.writeUInt8(1 + 4);
  buffer.writeUInt8(1); // positive
  buffer.writeUInt32LE(93);
  //console.log(buffer)

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);

  return test.done();
};

module.exports.numeric4BytesNegative = function(test) {
  var colMetaData = [
    {
      type: dataTypeByName.NumericN,
      precision: 3,
      scale: 1
    }
  ];

  var value = -9.3;

  var buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xd1);

  buffer.writeUInt8(1 + 4);
  buffer.writeUInt8(0); // negative
  buffer.writeUInt32LE(93);
  //console.log(buffer)

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);

  return test.done();
};

module.exports.numeric8Bytes = function(test) {
  var colMetaData = [
    {
      type: dataTypeByName.NumericN,
      precision: 13,
      scale: 1
    }
  ];

  var value = (0x100000000 + 93) / 10;

  var buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xd1);

  buffer.writeUInt8(1 + 8);
  buffer.writeUInt8(1); // positive
  buffer.writeUInt32LE(93);
  buffer.writeUInt32LE(1);
  //console.log(buffer)

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);

  return test.done();
};

module.exports.numeric12Bytes = function(test) {
  var colMetaData = [
    {
      type: dataTypeByName.NumericN,
      precision: 23,
      scale: 1
    }
  ];

  var value = (0x100000000 * 0x100000000 + 0x200000000 + 93) / 10;

  var buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xd1);

  buffer.writeUInt8(1 + 12);
  buffer.writeUInt8(1); // positive
  buffer.writeUInt32LE(93);
  buffer.writeUInt32LE(2);
  buffer.writeUInt32LE(1);
  //console.log(buffer)

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);

  return test.done();
};

module.exports.numeric16Bytes = function(test) {
  var colMetaData = [
    {
      type: dataTypeByName.NumericN,
      precision: 33,
      scale: 1
    }
  ];

  var value =
    (0x100000000 * 0x100000000 * 0x100000000 +
      0x200000000 * 0x100000000 +
      0x300000000 +
      93) /
    10;

  var buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xd1);

  buffer.writeUInt8(1 + 16);
  buffer.writeUInt8(1); // positive
  buffer.writeUInt32LE(93);
  buffer.writeUInt32LE(3);
  buffer.writeUInt32LE(2);
  buffer.writeUInt32LE(1);
  //console.log(buffer)

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, value);

  return test.done();
};

module.exports.numericNull = function(test) {
  var colMetaData = [
    {
      type: dataTypeByName.NumericN,
      precision: 3,
      scale: 1
    }
  ];

  var buffer = new WritableTrackingBuffer(0, 'ucs2');
  buffer.writeUInt8(0xd1);

  buffer.writeUInt8(0);
  //console.log(buffer)

  var parser = new Parser({ token() {} }, colMetaData, options);
  parser.write(buffer.data);
  var token = parser.read();
  //console.log(token)

  test.strictEqual(token.columns.length, 1);
  test.strictEqual(token.columns[0].value, null);

  return test.done();
};
