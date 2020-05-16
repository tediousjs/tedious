const assert = require('chai').assert;
const MoneyN = require('../../../src/data-types/moneyn');
const Money = require('../../../src/data-types/money');
const SmallMoney = require('../../../src/data-types/smallmoney');
const IntN = require('../../../src/data-types/intn');
const FloatN = require('../../../src/data-types/floatn');
const DateTimeN = require('../../../src/data-types/datetimen');
const NumericN = require('../../../src/data-types/numericn');

const Parser = require('../../../src/token/stream-parser');
const dataTypeByName = require('../../../src/data-type').typeByName;
const WritableTrackingBuffer = require('../../../src/tracking-buffer/writable-tracking-buffer');
const options = {
  useUTC: false,
  tdsVersion: '7_2'
};

describe('Row Token Parser', () => {
  it('should write int', () => {
    const colMetadata = [{ type: dataTypeByName.Int }];
    const value = 3;

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeUInt32LE(value);

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;

    parser.write(buffer.data);
    const token = parser.read();

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
  });

  it('should write bigint', () => {
    const colMetadata = [
      { type: dataTypeByName.BigInt },
      { type: dataTypeByName.BigInt }
    ];

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(
      Buffer.from([1, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 127])
    );

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;

    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 2);
    assert.strictEqual('1', token.columns[0].value);
    assert.strictEqual('9223372036854775807', token.columns[1].value);
  });

  it('should write real', () => {
    const colMetadata = [{ type: dataTypeByName.Real }];
    const value = 9.5;

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(Buffer.from([0x00, 0x00, 0x18, 0x41]));

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
  });

  it('should write float', () => {
    const colMetadata = [{ type: dataTypeByName.Float }];
    const value = 9.5;

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(
      Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x23, 0x40])
    );

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
  });

  it('should write Money', () => {
    const colMetadata = [
      { type: SmallMoney },
      { type: Money },
      { type: MoneyN },
      { type: MoneyN },
      { type: MoneyN },
      { type: MoneyN }
    ];
    const value = 123.456;
    const valueLarge = 123456789012345.11;

    const buffer = new WritableTrackingBuffer(0);
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(Buffer.from([0x80, 0xd6, 0x12, 0x00]));
    buffer.writeBuffer(
      Buffer.from([0x00, 0x00, 0x00, 0x00, 0x80, 0xd6, 0x12, 0x00])
    );
    buffer.writeBuffer(Buffer.from([0x00]));
    buffer.writeBuffer(Buffer.from([0x04, 0x80, 0xd6, 0x12, 0x00]));
    buffer.writeBuffer(
      Buffer.from([0x08, 0x00, 0x00, 0x00, 0x00, 0x80, 0xd6, 0x12, 0x00])
    );
    buffer.writeBuffer(
      Buffer.from([0x08, 0xf4, 0x10, 0x22, 0x11, 0xdc, 0x6a, 0xe9, 0x7d])
    );

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 6);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[1].value, value);
    assert.strictEqual(token.columns[2].value, null);
    assert.strictEqual(token.columns[3].value, value);
    assert.strictEqual(token.columns[4].value, value);
    assert.strictEqual(token.columns[5].value, valueLarge);
  });

  it('should write varchar without code page', () => {
    const colMetadata = [
      {
        type: dataTypeByName.VarChar,
        collation: {
          codepage: undefined
        }
      }
    ];
    const value = 'abcde';

    const buffer = new WritableTrackingBuffer(0, 'ascii');
    buffer.writeUInt8(0xd1);
    buffer.writeUsVarchar(value);
    // console.log(buffer.data)

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
  });

  it('should write varchar with code page', () => {
    const colMetadata = [
      {
        type: dataTypeByName.VarChar,
        collation: {
          codepage: 'WINDOWS-1252'
        }
      }
    ];
    const value = 'abcdé';

    const buffer = new WritableTrackingBuffer(0, 'ascii');
    buffer.writeUInt8(0xd1);
    buffer.writeUsVarchar(value);
    // console.log(buffer.data)

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
  });

  it('should write nvarchar', () => {
    const colMetadata = [{ type: dataTypeByName.NVarChar }];
    const value = 'abc';

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeUInt16LE(value.length * 2);
    buffer.writeString(value);
    // console.log(buffer.data)

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
  });

  it('should write varBinary', () => {
    const colMetadata = [{ type: dataTypeByName.VarBinary }];
    const value = Buffer.from([0x12, 0x34]);

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeUInt16LE(value.length);
    buffer.writeBuffer(Buffer.from(value));
    // console.log(buffer.data)

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 1);
    assert.deepEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
  });

  it('should write binary', () => {
    const colMetadata = [{ type: dataTypeByName.Binary }];
    const value = Buffer.from([0x12, 0x34]);

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeUInt16LE(value.length);
    buffer.writeBuffer(Buffer.from(value));
    // console.log(buffer.data)

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 1);
    assert.deepEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
  });

  it('should write varcharMaxNull', () => {
    const colMetadata = [
      {
        type: dataTypeByName.VarChar,
        dataLength: 65535,
        collation: {
          codepage: undefined
        }
      }
    ];

    const buffer = new WritableTrackingBuffer(0, 'ascii');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(
      Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
    );
    // console.log(buffer.data)

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, null);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
  });

  it('should write varcharMaxUnkownLength', () => {
    const colMetadata = [
      {
        type: dataTypeByName.VarChar,
        dataLength: 65535,
        collation: {
          codepage: undefined
        }
      }
    ];
    const value = 'abcdef';

    const buffer = new WritableTrackingBuffer(0, 'ascii');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(
      Buffer.from([0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
    );
    buffer.writeUInt32LE(3);
    buffer.writeString(value.slice(0, 3));
    buffer.writeUInt32LE(3);
    buffer.writeString(value.slice(3, 6));
    buffer.writeUInt32LE(0);
    // console.log(buffer.data)

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
  });

  it('should write varcharMaxKnownLength', () => {
    const colMetadata = [
      {
        type: dataTypeByName.VarChar,
        dataLength: 65535,
        collation: {
          codepage: undefined
        }
      }
    ];
    const value = 'abcdef';

    const buffer = new WritableTrackingBuffer(0, 'ascii');
    buffer.writeUInt8(0xd1);
    buffer.writeUInt64LE(value.length);
    buffer.writeUInt32LE(3);
    buffer.writeString(value.slice(0, 3));
    buffer.writeUInt32LE(3);
    buffer.writeString(value.slice(3, 6));
    buffer.writeUInt32LE(0);
    // console.log(buffer.data)

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
  });

  it('should write varcharmaxWithCodePage', () => {
    const colMetadata = [
      {
        type: dataTypeByName.VarChar,
        dataLength: 65535,
        collation: {
          codepage: 'WINDOWS-1252'
        }
      }
    ];
    const value = 'abcdéf';

    const buffer = new WritableTrackingBuffer(0, 'ascii');
    buffer.writeUInt8(0xd1);
    buffer.writeUInt64LE(value.length);
    buffer.writeUInt32LE(3);
    buffer.writeString(value.slice(0, 3));
    buffer.writeUInt32LE(3);
    buffer.writeString(value.slice(3, 6));
    buffer.writeUInt32LE(0);
    // console.log(buffer.data)

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
  });

  it('should write varcharMaxKnownLengthWrong', () => {
    const colMetadata = [
      {
        type: dataTypeByName.VarChar,
        dataLength: 65535
      }
    ];
    const value = 'abcdef';

    const buffer = new WritableTrackingBuffer(0, 'ascii');
    buffer.writeUInt8(0xd1);
    buffer.writeUInt64LE(value.length + 1);
    buffer.writeUInt32LE(3);
    buffer.writeString(value.slice(0, 3));
    buffer.writeUInt32LE(3);
    buffer.writeString(value.slice(3, 6));
    buffer.writeUInt32LE(0);
    // console.log(buffer.data)

    try {
      const parser = new Parser({ token() { } }, options);
      parser.colMetadata = colMetadata;
      parser.write(buffer.data);
      parser.read();
      assert.isOk(false);
    } catch {
      // ???
    }
  });

  it('should write varBinaryMaxNull', () => {
    const colMetadata = [
      {
        type: dataTypeByName.VarBinary,
        dataLength: 65535
      }
    ];

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(
      Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
    );
    // console.log(buffer.data)

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, null);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
  });

  it('should write varBinaryMaxUnknownLength', () => {
    const colMetadata = [
      {
        type: dataTypeByName.VarBinary,
        dataLength: 65535
      }
    ];
    const value = Buffer.from([0x12, 0x34, 0x56, 0x78]);

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(
      Buffer.from([0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
    );
    buffer.writeUInt32LE(2);
    buffer.writeBuffer(Buffer.from(value.slice(0, 2)));
    buffer.writeUInt32LE(2);
    buffer.writeBuffer(Buffer.from(value.slice(2, 4)));
    buffer.writeUInt32LE(0);
    // console.log(buffer.data)

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 1);
    assert.deepEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
  });

  it('should write intN', () => {
    const colMetadata = [
      { type: IntN },
      { type: IntN },
      { type: IntN },
      { type: IntN },
      { type: IntN },
      { type: IntN },
      { type: IntN },
      { type: IntN },
      { type: IntN },
      { type: IntN },
      { type: IntN },
      { type: IntN }
    ];

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(
      Buffer.from([
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
    // console.log(buffer.data)

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 12);
    assert.strictEqual(token.columns[0].value, null);
    assert.strictEqual('0', token.columns[1].value);
    assert.strictEqual('1', token.columns[2].value);
    assert.strictEqual('-1', token.columns[3].value);
    assert.strictEqual('2', token.columns[4].value);
    assert.strictEqual('-2', token.columns[5].value);
    assert.strictEqual('9223372036854775807', token.columns[6].value);
    assert.strictEqual('-9223372036854775808', token.columns[7].value);
    assert.strictEqual('10', token.columns[8].value);
    assert.strictEqual('100', token.columns[9].value);
    assert.strictEqual('1000', token.columns[10].value);
    assert.strictEqual('10000', token.columns[11].value);
  });

  it('parsing a UniqueIdentifier value when `lowerCaseGuids` option is `false`', () => {
    const colMetadata = [
      { type: dataTypeByName.UniqueIdentifier },
      { type: dataTypeByName.UniqueIdentifier }
    ];

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(
      Buffer.from([
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

    const parser = new Parser({ token() {} }, Object.assign({ lowerCaseGuids: false }, options));
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    var token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 2);
    assert.strictEqual(token.columns[0].value, null);
    assert.deepEqual(
      '67452301-AB89-EFCD-0123-456789ABCDEF',
      token.columns[1].value
    );
  });

  it('parsing a UniqueIdentifier value when `lowerCaseGuids` option is `true`', () => {
    var colMetadata = [
      { type: dataTypeByName.UniqueIdentifier },
      { type: dataTypeByName.UniqueIdentifier }
    ];

    var buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(
      Buffer.from([
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
    const parser = new Parser({ token() {} }, Object.assign({ lowerCaseGuids: true }, options));
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 2);
    assert.strictEqual(token.columns[0].value, null);
    assert.deepEqual(
      '67452301-ab89-efcd-0123-456789abcdef',
      token.columns[1].value
    );
  });

  it('should write floatN', () => {
    const colMetadata = [
      { type: FloatN },
      { type: FloatN },
      { type: FloatN }
    ];

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(
      Buffer.from([
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
    // console.log(buffer.data)

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 3);
    assert.strictEqual(token.columns[0].value, null);
    assert.strictEqual(9.5, token.columns[1].value);
    assert.strictEqual(9.5, token.columns[2].value);
  });

  it('should write datetime', () => {
    const colMetadata = [{ type: dataTypeByName.DateTime }];

    const days = 2; // 3rd January 1900
    const threeHundredthsOfSecond = 45 * 300; // 45 seconds

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);

    buffer.writeInt32LE(days);
    buffer.writeUInt32LE(threeHundredthsOfSecond);
    // console.log(buffer)

    let parser = new Parser({ token() { } }, { useUTC: false });
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    let token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(
      token.columns[0].value.getTime(),
      new Date('January 3, 1900 00:00:45').getTime()
    );

    parser = new Parser({ token() { } }, { useUTC: true });
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(
      token.columns[0].value.getTime(),
      new Date('January 3, 1900 00:00:45 GMT').getTime()
    );
  });

  it('should write datetimeN', () => {
    const colMetadata = [{ type: DateTimeN }];

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);

    buffer.writeUInt8(0);
    // console.log(buffer)

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, null);
  });

  it('should write numeric4Bytes', () => {
    const colMetadata = [
      {
        type: NumericN,
        precision: 3,
        scale: 1
      }
    ];

    const value = 9.3;

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);

    buffer.writeUInt8(1 + 4);
    buffer.writeUInt8(1); // positive
    buffer.writeUInt32LE(93);
    // console.log(buffer)

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
  });

  it('should write numeric4BytesNegative', () => {
    const colMetadata = [
      {
        type: NumericN,
        precision: 3,
        scale: 1
      }
    ];

    const value = -9.3;

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);

    buffer.writeUInt8(1 + 4);
    buffer.writeUInt8(0); // negative
    buffer.writeUInt32LE(93);
    // console.log(buffer)

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
  });

  it('should write numeric8Bytes', () => {
    const colMetadata = [
      {
        type: NumericN,
        precision: 13,
        scale: 1
      }
    ];

    const value = (0x100000000 + 93) / 10;

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);

    buffer.writeUInt8(1 + 8);
    buffer.writeUInt8(1); // positive
    buffer.writeUInt32LE(93);
    buffer.writeUInt32LE(1);
    // console.log(buffer)

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
  });

  it('should write numeric12Bytes', () => {
    const colMetadata = [
      {
        type: NumericN,
        precision: 23,
        scale: 1
      }
    ];

    const value = (0x100000000 * 0x100000000 + 0x200000000 + 93) / 10;

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);

    buffer.writeUInt8(1 + 12);
    buffer.writeUInt8(1); // positive
    buffer.writeUInt32LE(93);
    buffer.writeUInt32LE(2);
    buffer.writeUInt32LE(1);
    // console.log(buffer)

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
  });

  it('should write numeric16Bytes', () => {
    const colMetadata = [
      {
        type: NumericN,
        precision: 33,
        scale: 1
      }
    ];

    const value =
      (0x100000000 * 0x100000000 * 0x100000000 +
        0x200000000 * 0x100000000 +
        0x300000000 +
        93) /
      10;

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);

    buffer.writeUInt8(1 + 16);
    buffer.writeUInt8(1); // positive
    buffer.writeUInt32LE(93);
    buffer.writeUInt32LE(3);
    buffer.writeUInt32LE(2);
    buffer.writeUInt32LE(1);
    // console.log(buffer)

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
  });

  it('should write numericNull', () => {
    const colMetadata = [
      {
        type: NumericN,
        precision: 3,
        scale: 1
      }
    ];

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);

    buffer.writeUInt8(0);
    // console.log(buffer)

    const parser = new Parser({ token() { } }, options);
    parser.colMetadata = colMetadata;
    parser.write(buffer.data);
    const token = parser.read();
    // console.log(token)

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, null);
  });
});
