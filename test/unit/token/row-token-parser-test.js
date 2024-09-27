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

const {
  alwaysEncryptedOptions,
  generateEncryptedVarBinary,
  alwaysEncryptedIV,
  alwaysEncryptedCEK,
  cryptoMetadata,
} = require('../always-encrypted/crypto-util');

const options = {
  useUTC: false,
  tdsVersion: '7_2'
};

describe('Row Token Parser', () => {
  describe('parsing a row with many columns', function() {
    it('should parse them correctly', async function() {
      const buffer = new WritableTrackingBuffer(0, 'ascii');
      buffer.writeUInt8(0xd1);

      const colMetadata = [];
      for (let i = 0; i < 1024; i += 1) {
        colMetadata.push({
          type: dataTypeByName.VarChar,
          collation: {
            codepage: undefined
          }
        });
        buffer.writeUsVarchar(i.toString());
      }

      const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
      const result = await parser.next();
      assert.isFalse(result.done);
      const token = result.value;

      assert.strictEqual(token.columns.length, 1024);

      for (let i = 0; i < 1024; i += 1) {
        assert.strictEqual(token.columns[i].value, i.toString());
        assert.strictEqual(token.columns[i].metadata, colMetadata[i]);
      }

      assert.isTrue((await parser.next()).done);
    });
  });

  it('should write int', async () => {
    const colMetadata = [{ type: dataTypeByName.Int }];
    const value = 3;

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeUInt32LE(value);

    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write encrypted int', async () => {
    const baseTypeInfo = { type: dataTypeByName.Int };
    const colMetadata = [{
      type: dataTypeByName.VarBinary,
      cryptoMetadata: {
        ...cryptoMetadata,
        baseTypeInfo,
      },
    }];
    const value = Buffer.from([
      0x03, 0x00, 0x00, 0x00,
    ]);

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xD1);
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        value,
      ),
    );

    const parser = Parser.parseTokens([buffer.data], {}, alwaysEncryptedOptions, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    // console.log(token);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, 0x03);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);

    assert.isTrue((await parser.next()).done);
  });

  it('should write bigint', async () => {
    const colMetadata = [
      { type: dataTypeByName.BigInt },
      { type: dataTypeByName.BigInt }
    ];

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(
      Buffer.from([1, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 127])
    );

    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 2);
    assert.strictEqual('1', token.columns[0].value);
    assert.strictEqual('9223372036854775807', token.columns[1].value);
    assert.isTrue((await parser.next()).done);
  });

  it('should write encrypted bigint', async () => {
    const baseTypeInfo = {
      type: dataTypeByName.BigInt,
    };
    const colMetaDataEntry = {
      type: dataTypeByName.VarBinary,
      cryptoMetadata: {
        ...cryptoMetadata,
        baseTypeInfo,
      },
    };
    const colMetadata = [colMetaDataEntry, colMetaDataEntry];

    const value1 = Buffer.from([
      // 1
      0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    const value2 = Buffer.from([
      // 9223372036854775807
      0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x7F,
    ]);

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xD1);
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        value1,
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        value2,
      ),
    );
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], {}, alwaysEncryptedOptions, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    // console.log(token);
    assert.strictEqual(token.columns.length, 2);
    assert.strictEqual(token.columns[0].value, '1');
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.strictEqual(token.columns[1].value, '9223372036854775807');
    assert.strictEqual(token.columns[1].metadata, colMetadata[1]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write real', async () => {
    const colMetadata = [{ type: dataTypeByName.Real }];
    const value = 9.5;

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(Buffer.from([0x00, 0x00, 0x18, 0x41]));

    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    // console.log(token)
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write encrypted real', async () => {
    const baseTypeInfo = {
      type: dataTypeByName.Real,
    };
    const colMetadata = [{
      type: dataTypeByName.VarBinary,
      cryptoMetadata: {
        ...cryptoMetadata,
        baseTypeInfo,
      },
    }];
    const value = Buffer.from([
      // 9.5
      0x00, 0x00, 0x18, 0x41,
    ]);

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xD1);
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        value,
      ),
    );
    // console.log(buffer.data)
    const parser = Parser.parseTokens([buffer.data], {}, alwaysEncryptedOptions, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, 9.5);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write float', async () => {
    const colMetadata = [{ type: dataTypeByName.Float }];
    const value = 9.5;

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeBuffer(
      Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x23, 0x40])
    );

    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write encrypted float', async () => {
    const baseTypeInfo = {
      type: dataTypeByName.Float,
    };
    const colMetadata = [{
      type: dataTypeByName.VarBinary,
      cryptoMetadata: {
        ...cryptoMetadata,
        baseTypeInfo,
      },
    }];
    const value = Buffer.from([
      // 9.5
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x23, 0x40,
    ]);

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        value,
      ),
    );
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], {}, alwaysEncryptedOptions, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, 9.5);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write Money', async () => {
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

    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 6);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[1].value, value);
    assert.strictEqual(token.columns[2].value, null);
    assert.strictEqual(token.columns[3].value, value);
    assert.strictEqual(token.columns[4].value, value);
    assert.strictEqual(token.columns[5].value, valueLarge);
    assert.isTrue((await parser.next()).done);
  });

  it('should write encrypted money variants', async () => {
    const baseTypeInfo = [
      { type: SmallMoney },
      { type: Money },
      { type: MoneyN, dataLength: 0x00 },
      { type: MoneyN, dataLength: 0x04 },
      { type: MoneyN, dataLength: 0x08 },
      { type: MoneyN, dataLength: 0x08 },
    ];
    const colMetadata = baseTypeInfo.map((baseTypeInfo) => ({
      type: dataTypeByName.VarBinary,
      cryptoMetadata: {
        ...cryptoMetadata,
        baseTypeInfo,
      },
    }));

    const value = 123.456;
    const valueLarge = 123456789012345.11;
    const expectedValues = [
      value,
      value,
      null,
      value,
      value,
      valueLarge,
    ];

    const buffer = new WritableTrackingBuffer(0);
    buffer.writeUInt8(0xD1);
    // despite having a dataLength, all decrypted money types are 8 bytes long
    // (they also do not contain the leading dataLength byte)
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        Buffer.from([0x80, 0xd6, 0x12, 0x00]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        Buffer.from([0x00, 0x00, 0x00, 0x00, 0x80, 0xD6, 0x12, 0x00]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        Buffer.from([]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        Buffer.from([0x80, 0xd6, 0x12, 0x00]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        Buffer.from([0x00, 0x00, 0x00, 0x00, 0x80, 0xD6, 0x12, 0x00]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        Buffer.from([0xF4, 0x10, 0x22, 0x11, 0xDC, 0x6A, 0xE9, 0x7D]),
      ),
    );
    // console.log(buffer.data)
    const parser = Parser.parseTokens([buffer.data], {}, alwaysEncryptedOptions, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;
    // console.log(token);

    assert.strictEqual(token.columns.length, expectedValues.length);
    const actualValues = token.columns.map(({ value }) => value);
    assert.deepEqual(actualValues, expectedValues);
  });

  it('should write varchar without code page', async () => {
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


    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write varchar with code page', async () => {
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


    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write encrypted varchar without code page', async () => {
    const baseTypeInfo = {
      userType: 0x00,
      flags: 0x080B,
      type: dataTypeByName.VarChar,
      collation: { codepage: undefined },
    };
    const colMetadata = [{
      type: dataTypeByName.VarBinary,
      cryptoMetadata: {
        ...cryptoMetadata,
        baseTypeInfo,
      },
    }];
    const value = 'hello world';

    const buffer = new WritableTrackingBuffer(0, 'ascii');
    buffer.writeUInt8(0xD1);
    buffer.writeUsVarbyte(
      // encrypted blob must be formatted correctly
      Buffer.from([
        // algorithm version (1 byte)
        0x01,

        // authentication tag (32 bytes)
        // calculated with macKey (above), iv, and cipher-text (below)
        // e.g. to calculate the expected HMAC
        // ( echo -n '01' ; \
        //     echo -n '11111111111111111111111111111111' ; \
        //     echo -n 'd7cb90a5663df56da49220c09c08f3b9' ; \
        //     echo -n '01' ) | \
        //   xxd -r -ps | \
        //   openssl dgst \
        //     -sha256 -mac HMAC \
        //     -macopt hexkey:'9d1f2295e509519ed0f1bff77659713280a3651fa2d7a7023abd1ba519012573'
        // # af43a7120629065cfbdd00f25462a4f3f2b63091ce312a0bff5c2ca064e555db
        0xAF, 0x43, 0xA7, 0x12, 0x06, 0x29, 0x06, 0x5C,
        0xFB, 0xDD, 0x00, 0xF2, 0x54, 0x62, 0xA4, 0xF3,
        0xF2, 0xB6, 0x30, 0x91, 0xCE, 0x31, 0x2A, 0x0B,
        0xFF, 0x5C, 0x2C, 0xA0, 0x64, 0xE5, 0x55, 0xDB,

        // iv (16 bytes)
        // arbitrary, but must be the one used in the authentication tag above
        ...alwaysEncryptedIV,

        // cipher text
        // calculated with encryptionKey, and plain-text (above)
        // e.g. to generate the desired cipher text
        // echo -n hello world | \
        //   openssl enc -e -aes-256-cbc -md sha256 \
        //     -K '02c735a87529f1d1eb3853852c2a45cf667331dda269c18feac9aec29675b349' \
        //     -iv '11111111111111111111111111111111' | \
        //   xxd -ps
        // # d7cb90a5663df56da49220c09c08f3b9
        0xD7, 0xCB, 0x90, 0xA5, 0x66, 0x3D, 0xF5, 0x6D,
        0xA4, 0x92, 0x20, 0xC0, 0x9C, 0x08, 0xF3, 0xB9,
      ]),
    );
    // console.log(buffer.data);

    const parser = Parser.parseTokens([buffer.data], {}, alwaysEncryptedOptions, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;
    // console.log(token);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write encrypted varchar with code page', async () => {
    const baseTypeInfo = {
      userType: 0x00,
      type: dataTypeByName.VarChar,
      collation: { codepage: 'WINDOWS-1252' },
    };
    const colMetadata = [{
      type: dataTypeByName.VarBinary,
      cryptoMetadata: {
        ...cryptoMetadata,
        baseTypeInfo,
      },
    }];
    const value = 'abcdé';

    const buffer = new WritableTrackingBuffer(0, 'ascii');
    buffer.writeUInt8(0xD1);
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        Buffer.from(value, 'ascii'),
      ),
    );
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], {}, alwaysEncryptedOptions, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    // console.log(token);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write nvarchar', async () => {
    const colMetadata = [{ type: dataTypeByName.NVarChar }];
    const value = 'abc';

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeUInt16LE(value.length * 2);
    buffer.writeString(value);
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write encrypted nvarchar', async () => {
    const baseTypeInfo = {
      userType: 0x00,
      type: dataTypeByName.NVarChar,
    };
    const colMetadata = [{
      type: dataTypeByName.VarBinary,
      cryptoMetadata: {
        ...cryptoMetadata,
        baseTypeInfo,
      },
    }];
    const value = 'abc';

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        Buffer.from(value, 'utf16le'),
      ),
    );
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], {}, alwaysEncryptedOptions, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write varBinary', async () => {
    const colMetadata = [{ type: dataTypeByName.VarBinary }];
    const value = Buffer.from([0x12, 0x34]);

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeUInt16LE(value.length);
    buffer.writeBuffer(Buffer.from(value));
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;


    assert.strictEqual(token.columns.length, 1);
    assert.deepEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write encrypted varBinary', async () => {
    const baseTypeInfo = {
      type: dataTypeByName.VarBinary,
    };
    const colMetadata = [{
      type: dataTypeByName.VarBinary,
      cryptoMetadata: {
        ...cryptoMetadata,
        baseTypeInfo,
      },
    }];
    const value = Buffer.from([0x12, 0x34]);

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xD1);
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        value,
      ),
    );
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], {}, alwaysEncryptedOptions, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    // console.log(token);
    assert.strictEqual(token.columns.length, 1);
    assert.deepEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write binary', async () => {
    const colMetadata = [{ type: dataTypeByName.Binary }];
    const value = Buffer.from([0x12, 0x34]);

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);
    buffer.writeUInt16LE(value.length);
    buffer.writeBuffer(Buffer.from(value));
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;


    assert.strictEqual(token.columns.length, 1);
    assert.deepEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write encrypted binary', async () => {
    const baseTypeInfo = { type: dataTypeByName.Binary };
    const colMetadata = [{
      type: dataTypeByName.VarBinary,
      cryptoMetadata: {
        ...cryptoMetadata,
        baseTypeInfo,
      },
    }];
    const value = Buffer.from([0x12, 0x34]);

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xD1);
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        value,
      ),
    );
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], {}, alwaysEncryptedOptions, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;
    // console.log(token);
    assert.strictEqual(token.columns.length, 1);
    assert.deepEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write varcharMaxNull', async () => {
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

    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, null);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write encrypted varcharMaxNull', async () => {
    const baseTypeInfo = {
      type: dataTypeByName.VarChar,
      dataLength: 65535,
      collation: { codepage: undefined },
    };
    const colMetadata = [{
      type: dataTypeByName.VarBinary,
      cryptoMetadata: {
        ...cryptoMetadata,
        baseTypeInfo,
      },
    }];
    const value = Buffer.from([
      0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    ]);

    const buffer = new WritableTrackingBuffer(0, 'ascii');
    buffer.writeUInt8(0xD1);
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        value,
      ),
    );
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], {}, alwaysEncryptedOptions, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;
    // console.log(token);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, null);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write varcharMaxUnkownLength', async () => {
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

    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write varcharMaxKnownLength', async () => {
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


    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write encrypted varcharMaxKnownLength', async () => {
    const baseTypeInfo = {
      type: dataTypeByName.VarChar,
      dataLength: 65535,
      collation: { codepage: undefined },
    };
    const colMetadata = [{
      type: dataTypeByName.VarBinary,
      cryptoMetadata: {
        ...cryptoMetadata,
        baseTypeInfo,
      },
    }];
    const value = Buffer.from([
      // no PLP known length prefix, only PLP_NULL needs to be explicitly specified
      // 'abcdef'
      0x61, 0x62, 0x63, 0x64, 0x65, 0x66,
    ]);

    const buffer = new WritableTrackingBuffer(0, 'ascii');
    buffer.writeUInt8(0xD1);
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        value,
      ),
    );
    // console.log(buffer.data)
    const parser = Parser.parseTokens([buffer.data], {}, alwaysEncryptedOptions, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    // console.log(token);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, 'abcdef');
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write varcharmaxWithCodePage', async () => {
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

    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write encrypted varcharmaxWithCodePage', async () => {
    const baseTypeInfo = {
      type: dataTypeByName.VarChar,
      dataLength: 65535,
      collation: { codepage: 'WINDOWS-1252' },
    };
    const colMetadata = [{
      type: dataTypeByName.VarBinary,
      cryptoMetadata: {
        ...cryptoMetadata,
        baseTypeInfo,
      },
    }];
    const value = Buffer.from([
      // chunk 1: 'abcdéf'
      0x61, 0x62, 0x63, 0x64, 0xE9, 0x66,
    ]);

    const buffer = new WritableTrackingBuffer(0, 'ascii');
    buffer.writeUInt8(0xD1);
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        value,
      ),
    );
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], {}, alwaysEncryptedOptions, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;
    // console.log(token);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, 'abcdéf');
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write varcharMaxKnownLengthWrong', async () => {
    const colMetadata = [
      {
        type: dataTypeByName.VarChar,
        dataLength: 65535,
        collation: {
          codepage: 'WINDOWS-1252'
        }
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

    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);

    let error;
    try {
      await parser.next();
    } catch (err) {
      error = err;
    }

    assert.instanceOf(error, Error);
    assert.strictEqual(error.message, 'Partially Length-prefixed Bytes unmatched lengths : expected 7, but got 6 bytes');
    assert.isTrue((await parser.next()).done);
  });

  it('should write varBinaryMaxNull', async () => {
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

    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, null);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write encrypted varBinaryMaxNull', async () => {
    const baseTypeInfo = {
      type: dataTypeByName.VarBinary,
      dataLength: 65535,
    };
    const colMetadata = [{
      type: dataTypeByName.VarBinary,
      cryptoMetadata: {
        ...cryptoMetadata,
        baseTypeInfo,
      },
    }];
    const value = Buffer.from([
      0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    ]);

    const buffer = new WritableTrackingBuffer(0, 'ascii');
    buffer.writeUInt8(0xD1);
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        value,
      ),
    );
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], {}, alwaysEncryptedOptions, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;
    // console.log(token);
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, null);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write varBinaryMaxUnknownLength', async () => {
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
    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 1);
    assert.deepEqual(token.columns[0].value, value);
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write intN', async () => {
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

    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

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
    assert.isTrue((await parser.next()).done);
  });

  it('should write encrypted intN variants', async () => {
    const baseTypeInfo = [
      { type: IntN, dataLength: 0x00 },
      { type: IntN, dataLength: 0x08 },
      { type: IntN, dataLength: 0x08 },
      { type: IntN, dataLength: 0x08 },
      { type: IntN, dataLength: 0x08 },
      { type: IntN, dataLength: 0x08 },
      { type: IntN, dataLength: 0x08 },
      { type: IntN, dataLength: 0x08 },
      { type: IntN, dataLength: 0x08 },
      { type: IntN, dataLength: 0x08 },
      { type: IntN, dataLength: 0x08 },
      { type: IntN, dataLength: 0x08 },
      { type: IntN, dataLength: 0x01 },
      { type: IntN, dataLength: 0x02 },
      { type: IntN, dataLength: 0x04 },
    ];
    const colMetadata = baseTypeInfo.map((baseTypeInfo) => ({
      type: dataTypeByName.VarBinary,
      cryptoMetadata: {
        ...cryptoMetadata,
        baseTypeInfo,
      },
    }));

    const expectedValues = [
      null,
      // 8-length intN is treated as bigint, so they will be strings
      '0',
      '1',
      '-1',
      '2',
      '-2',
      '9223372036854775807',
      '-9223372036854775808',
      '10',
      '100',
      '1000',
      '10000',
      // 1-length, 2-length, and 4-length will end up as numbers
      3,
      4,
      5,
    ];

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xD1);
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        // null
        Buffer.from([]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        // 0
        Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        // 1
        Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        // -1
        Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        // 2
        Buffer.from([0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        // -2
        Buffer.from([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        // 9223372036854775807
        Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x7F]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        // -9223372036854775808
        Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        // 10
        Buffer.from([0x0A, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        // 100
        Buffer.from([0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        // 1000
        Buffer.from([0xE8, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        // 10000
        Buffer.from([0x10, 0x27, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        // 3
        Buffer.from([0x03]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        // 4
        Buffer.from([0x04, 0x00]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        // 5
        Buffer.from([0x05, 0x00, 0x00, 0x00]),
      ),
    );
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], {}, alwaysEncryptedOptions, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    // console.log(token);
    assert.strictEqual(token.columns.length, expectedValues.length);
    const actualValues = token.columns.map(({ value }) => value);
    assert.deepEqual(actualValues, expectedValues);
    assert.isTrue((await parser.next()).done);
  });

  it('parsing a UniqueIdentifier value when `lowerCaseGuids` option is `false`', async () => {
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


    const parser = Parser.parseTokens([buffer.data], { lowerCaseGuids: false }, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 2);
    assert.strictEqual(token.columns[0].value, null);
    assert.deepEqual(
      '67452301-AB89-EFCD-0123-456789ABCDEF',
      token.columns[1].value
    );
    assert.isTrue((await parser.next()).done);

  });

  it('should write encrypted UniqueIdentifier when `lowerCaseGuids` option is `false`', async () => {
    const baseTypeInfo = [
      { type: dataTypeByName.UniqueIdentifier, dataLength: 0x00 },
      { type: dataTypeByName.UniqueIdentifier, dataLength: 0x10 },
    ];
    const colMetadata = baseTypeInfo.map((baseTypeInfo) => ({
      type: dataTypeByName.VarBinary,
      cryptoMetadata: {
        ...cryptoMetadata,
        baseTypeInfo,
      },
    }));

    const expectedValues = [
      null,
      '67452301-AB89-EFCD-0123-456789ABCDEF',
    ];

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xD1);
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        // null
        Buffer.from([]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        // 67452301-AB89-EFCD-0123-456789ABCDEF
        Buffer.from([
          0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF,
          0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF,
        ]),
      ),
    );
    // console.log(buffer.data)

    const parserOptions = {
      ...alwaysEncryptedOptions,
      lowerCaseGuids: false,
    };
    const parser = Parser.parseTokens([buffer.data], { lowerCaseGuids: false }, parserOptions, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;


    // console.log(token);
    assert.strictEqual(token.columns.length, expectedValues.length);
    const actualValues = token.columns.map(({ value }) => value);
    assert.deepEqual(actualValues, expectedValues);
    assert.isTrue((await parser.next()).done);
  });

  it('parsing a UniqueIdentifier value when `lowerCaseGuids` option is `true`', async () => {
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

    const parser = Parser.parseTokens([buffer.data], {}, { ...options, lowerCaseGuids: true }, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 2);
    assert.strictEqual(token.columns[0].value, null);
    assert.deepEqual(
      '67452301-ab89-efcd-0123-456789abcdef',
      token.columns[1].value
    );
    assert.isTrue((await parser.next()).done);
  });

  it('should write encrypted UniqueIdentifier when `lowerCaseGuids` option is `true`', async () => {
    const baseTypeInfo = [
      { type: dataTypeByName.UniqueIdentifier, dataLength: 0x00 },
      { type: dataTypeByName.UniqueIdentifier, dataLength: 0x10 },
    ];
    const colMetadata = baseTypeInfo.map((baseTypeInfo) => ({
      type: dataTypeByName.VarBinary,
      cryptoMetadata: {
        ...cryptoMetadata,
        baseTypeInfo,
      },
    }));

    const expectedValues = [
      null,
      '67452301-ab89-efcd-0123-456789abcdef',
    ];

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xD1);
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        // null
        Buffer.from([]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        // 67452301-ab89-efcd-0123-456789abcdef
        Buffer.from([
          0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF,
          0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF,
        ]),
      ),
    );
    // console.log(buffer.data)

    const parserOptions = {
      ...alwaysEncryptedOptions,
      lowerCaseGuids: true,
    };
    const parser = Parser.parseTokens([buffer.data], { lowerCaseGuids: false }, parserOptions, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;


    assert.strictEqual(token.columns.length, expectedValues.length);
    const actualValues = token.columns.map(({ value }) => value);
    assert.deepEqual(actualValues, expectedValues);
    assert.isTrue((await parser.next()).done);
  });

  it('should write floatN', async () => {
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

    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 3);
    assert.strictEqual(token.columns[0].value, null);
    assert.strictEqual(9.5, token.columns[1].value);
    assert.strictEqual(9.5, token.columns[2].value);
    assert.isTrue((await parser.next()).done);
  });

  it('should write encrypted floatN variants', async () => {
    const baseTypeInfo = [
      { type: FloatN, dataLength: 0x00 },
      { type: FloatN, dataLength: 0x04 },
      { type: FloatN, dataLength: 0x08 },
    ];
    const colMetadata = baseTypeInfo.map((baseTypeInfo) => ({
      type: dataTypeByName.VarBinary,
      cryptoMetadata: {
        ...cryptoMetadata,
        baseTypeInfo,
      },
    }));

    const expectedValues = [
      null,
      9.5,
      9.5,
    ];

    const buffer = new WritableTrackingBuffer(0);
    buffer.writeUInt8(0xD1);
    // despite having a dataLength, all decrypted float types are 8 bytes long
    // (they also do not contain the leading dataLength byte)
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        Buffer.from([]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        // 9.5
        Buffer.from([0x00, 0x00, 0x18, 0x41]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        // 9.5
        Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x23, 0x40]),
      ),
    );
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], {}, alwaysEncryptedOptions, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;
    // console.log(token);
    assert.strictEqual(token.columns.length, expectedValues.length);
    const actualValues = token.columns.map(({ value }) => value);
    assert.deepEqual(actualValues, expectedValues);
    assert.isTrue((await parser.next()).done);
  });

  it('should write datetime', async () => {
    const colMetadata = [{ type: dataTypeByName.DateTime }];

    const days = 2; // 3rd January 1900
    const threeHundredthsOfSecond = 45 * 300; // 45 seconds

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);

    buffer.writeInt32LE(days);
    buffer.writeUInt32LE(threeHundredthsOfSecond);
    // console.log(buffer)

    {
      const parser = Parser.parseTokens([buffer.data], {}, { ...options, useUTC: false }, colMetadata);

      let result = await parser.next();
      assert.isFalse(result.done);

      const token = result.value;
      assert.strictEqual(token.columns.length, 1);
      assert.strictEqual(
        token.columns[0].value.getTime(),
        new Date('January 3, 1900 00:00:45').getTime()
      );

      result = await parser.next();
      assert.isTrue(result.done);
      assert.isTrue((await parser.next()).done);
    }

    {
      const parser = Parser.parseTokens([buffer.data], {}, { ...options, useUTC: true }, colMetadata);

      let result = await parser.next();
      assert.isFalse(result.done);

      const token = result.value;
      assert.strictEqual(token.columns.length, 1);
      assert.strictEqual(
        token.columns[0].value.getTime(),
        new Date('January 3, 1900 00:00:45 GMT').getTime()
      );

      result = await parser.next();
      assert.isTrue(result.done);
      assert.isTrue((await parser.next()).done);
    }
  });

  it('should write encrypted datetime when `useUTC` option is `false`', async () => {
    const baseTypeInfo = {
      type: dataTypeByName.DateTime,
    };
    const colMetadata = [{
      type: dataTypeByName.VarBinary,
      cryptoMetadata: {
        ...cryptoMetadata,
        baseTypeInfo,
      },
    }];

    const value = Buffer.from([
      // January 3, 1900 00:00:45
      // 3rd January 1900
      0x02, 0x00, 0x00, 0x00,
      // 45 seconds
      0xBC, 0x34, 0x00, 0x00
    ]);

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xD1);
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        value,
      ),
    );
    // console.log(buffer.data)

    const parserOptions = {
      ...alwaysEncryptedOptions,
      useUTC: false,
    };
    const parser = Parser.parseTokens([buffer.data], { lowerCaseGuids: false }, parserOptions, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;


    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(
      token.columns[0].value.getTime(),
      new Date('January 3, 1900 00:00:45').getTime(),
    );
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write encrypted datetime when `useUTC` option is `true`', async () => {
    const baseTypeInfo = {
      type: dataTypeByName.DateTime,
    };
    const colMetadata = [{
      type: dataTypeByName.VarBinary,
      cryptoMetadata: {
        ...cryptoMetadata,
        baseTypeInfo,
      },
    }];

    const value = Buffer.from([
      // January 3, 1900 00:00:45
      // 3rd January 1900
      0x02, 0x00, 0x00, 0x00,
      // 45 seconds
      0xBC, 0x34, 0x00, 0x00
    ]);

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xD1);
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        value,
      ),
    );
    // console.log(buffer.data)

    const parserOptions = {
      ...alwaysEncryptedOptions,
      useUTC: true,
    };
    const parser = Parser.parseTokens([buffer.data], { lowerCaseGuids: false }, parserOptions, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;


    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(
      token.columns[0].value.getTime(),
      new Date('January 3, 1900 00:00:45 GMT').getTime(),
    );
    assert.strictEqual(token.columns[0].metadata, colMetadata[0]);
    assert.isTrue((await parser.next()).done);
  });

  it('should write datetimeN', async () => {
    const colMetadata = [{ type: DateTimeN }];

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xd1);

    buffer.writeUInt8(0);
    // console.log(buffer)

    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    // console.log(token)
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, null);
    assert.isTrue((await parser.next()).done);
  });

  it('should write encrypted datetimeN variants', async () => {
    const baseTypeInfo = [
      { type: DateTimeN, dataLength: 0x00 },
      { type: DateTimeN, dataLength: 0x04 },
      { type: DateTimeN, dataLength: 0x08 },
    ];
    const colMetadata = baseTypeInfo.map((baseTypeInfo) => ({
      type: dataTypeByName.VarBinary,
      cryptoMetadata: {
        ...cryptoMetadata,
        baseTypeInfo,
      },
    }));

    const expectedValues = [
      null,
      new Date('January 3, 1900 00:45:00').getTime(),
      new Date('January 3, 1900 00:00:45').getTime(),
    ];

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xD1);
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        Buffer.from([]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        Buffer.from([0x02, 0x00, 0x2D, 0x00]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        Buffer.from([0x02, 0x00, 0x00, 0x00, 0xBC, 0x34, 0x00, 0x00]),
      ),
    );
    // console.log(buffer.data)

    const parserOptions = {
      ...alwaysEncryptedOptions,
      useUTC: false,
    };
    const parser = Parser.parseTokens([buffer.data], { lowerCaseGuids: false }, parserOptions, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, expectedValues.length);
    const actualValues = token.columns.map(
      ({ value }) => { return value === null ? value : value.getTime(); },
    );
    assert.deepEqual(actualValues, expectedValues);
    assert.isTrue((await parser.next()).done);
  });

  it('should write numeric4Bytes', async () => {
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

    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    // console.log(token)
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.isTrue((await parser.next()).done);
  });

  it('should write numeric4BytesNegative', async () => {
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

    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.isTrue((await parser.next()).done);
  });

  it('should write numeric8Bytes', async () => {
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

    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;


    // console.log(token)
    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.isTrue((await parser.next()).done);
  });

  it('should write numeric12Bytes', async () => {
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

    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    // console.log(token)
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.isTrue((await parser.next()).done);
  });

  it('should write numeric16Bytes', async () => {
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

    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    // console.log(token)
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, value);
    assert.isTrue((await parser.next()).done);
  });

  it('should write numericNull', async () => {
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

    const parser = Parser.parseTokens([buffer.data], {}, options, colMetadata);
    const result = await parser.next();
    // console.log(token)
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, 1);
    assert.strictEqual(token.columns[0].value, null);
    assert.isTrue((await parser.next()).done);
  });

  it('should write encrypted numericN variants', async () => {
    const baseTypeInfo = [
      { type: NumericN, precision: 3, scale: 1, dataLength: 5 },
      { type: NumericN, precision: 3, scale: 1, dataLength: 5 },
      { type: NumericN, precision: 13, scale: 1, dataLength: 9 },
      { type: NumericN, precision: 23, scale: 1, dataLength: 13 },
      { type: NumericN, precision: 33, scale: 1, dataLength: 17 },
      { type: NumericN, precision: 3, scale: 1, dataLength: 0 },
    ];
    const colMetadata = baseTypeInfo.map((baseTypeInfo) => ({
      type: dataTypeByName.VarBinary,
      cryptoMetadata: {
        ...cryptoMetadata,
        baseTypeInfo,
      },
    }));

    const expectedValues = [
      9.3,
      -9.3,
      (0x100000000 + 93) / 10,
      (0x100000000 * 0x100000000 + 0x200000000 + 93) / 10,
      (0x100000000 * 0x100000000 * 0x100000000 +
        0x200000000 * 0x100000000 +
        0x300000000 +
        93) / 10,
      null,
    ];

    const buffer = new WritableTrackingBuffer(0, 'ucs2');
    buffer.writeUInt8(0xD1);
    // despite having a dataLength, all decrypted numeric types have multiples of 8 byte length
    // (they also do not contain the leading dataLength byte, but do contain the sign byte)
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        Buffer.from([
          // 9.3
          0x01, 0x5D, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        Buffer.from([
          // -9.3
          0x00, 0x5D, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        Buffer.from([
          // 429496738.9
          0x01, 0x5D, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
        ]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        Buffer.from([
          // 1844674408229948700
          0x01, 0x5D, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00,
          0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        Buffer.from([
          // 7.922816255115783e+27
          0x01, 0x5D, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00,
          0x00, 0x02, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
        ]),
      ),
    );
    buffer.writeUsVarbyte(
      generateEncryptedVarBinary(
        alwaysEncryptedCEK,
        alwaysEncryptedIV,
        Buffer.from([]),
      ),
    );
    // console.log(buffer.data)

    const parser = Parser.parseTokens([buffer.data], {}, alwaysEncryptedOptions, colMetadata);
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.columns.length, expectedValues.length);
    const actualValues = token.columns.map(({ value }) => value);
    assert.deepEqual(actualValues, expectedValues);
    assert.isTrue((await parser.next()).done);
  });
});
