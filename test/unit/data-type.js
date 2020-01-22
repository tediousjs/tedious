const TYPES = require('../../src/data-type');
const WritableTrackingBuffer = require('../../src/tracking-buffer/writable-tracking-buffer');
const assert = require('chai').assert;

describe('Data Types', function () {
  // Test date calculation for non utc date during daylight savings period
  it('smallDateTimeDaylightSaving', () => {
    const type = TYPES.typeByName.SmallDateTime;
    for (const testSet of [
      [new Date(2015, 5, 18, 23, 59, 59), 42171],
      [new Date(2015, 5, 19, 0, 0, 0), 42172],
      [new Date(2015, 5, 19, 23, 59, 59), 42172],
      [new Date(2015, 5, 20, 0, 0, 0), 42173]
    ]) {
      const buffer = new WritableTrackingBuffer(0);
      const parameter = { value: testSet[0] };
      const expectedNoOfDays = testSet[1];
      type.writeParameterData(buffer, parameter, { useUTC: false }, () => { });
      assert.strictEqual(buffer.buffer.readUInt16LE(1), expectedNoOfDays);
    }
  });

  it('dateTimeDaylightSaving', () => {
    const type = TYPES.typeByName.DateTime;
    for (const testSet of [
      [new Date(2015, 5, 18, 23, 59, 59), 42171],
      [new Date(2015, 5, 19, 0, 0, 0), 42172],
      [new Date(2015, 5, 19, 23, 59, 59), 42172],
      [new Date(2015, 5, 20, 0, 0, 0), 42173]
    ]) {
      const buffer = new WritableTrackingBuffer(0);
      const parameter = { value: testSet[0] };
      const expectedNoOfDays = testSet[1];
      type.writeParameterData(buffer, parameter, { useUTC: false }, () => { });
      assert.strictEqual(buffer.data.readInt32LE(1), expectedNoOfDays)
    }
  });

  it('dateTime2DaylightSaving', () => {
    const type = TYPES.typeByName.DateTime2;
    for (const [value, expectedBuffer] of [
      [new Date(2015, 5, 18, 23, 59, 59), Buffer.from('067f5101163a0b', 'hex')],
      [new Date(2015, 5, 19, 0, 0, 0), Buffer.from('06000000173a0b', 'hex')],
      [new Date(2015, 5, 19, 23, 59, 59), Buffer.from('067f5101173a0b', 'hex')],
      [new Date(2015, 5, 20, 0, 0, 0), Buffer.from('06000000183a0b', 'hex')]
    ]) {
      const buffer = new WritableTrackingBuffer(0);
      type.writeParameterData(buffer, { value: value, scale: 0 }, { useUTC: false }, () => { });
      assert.deepEqual(buffer.data, expectedBuffer)
    }
  });

  it('dateDaylightSaving', () => {
    const type = TYPES.typeByName.Date;
    for (const [value, expectedBuffer] of [
      [new Date(2015, 5, 18, 23, 59, 59), Buffer.from('03163a0b', 'hex')],
      [new Date(2015, 5, 19, 0, 0, 0), Buffer.from('03173a0b', 'hex')],
      [new Date(2015, 5, 19, 23, 59, 59), Buffer.from('03173a0b', 'hex')],
      [new Date(2015, 5, 20, 0, 0, 0), Buffer.from('03183a0b', 'hex')]
    ]) {
      const buffer = new WritableTrackingBuffer(0);
      type.writeParameterData(buffer, { value: value }, { useUTC: false }, () => { });
      assert.deepEqual(buffer.data, expectedBuffer);
    }
  });

  // Test rounding of nanosecondDelta
  it('nanoSecondRounding', () => {
    const type = TYPES.typeByName.Time;
    for (const [value, nanosecondDelta, scale, expectedBuffer] of [
      [new Date(2017, 6, 29, 17, 20, 3, 503), 0.0006264, 7, Buffer.from('0568fc624b91', 'hex')],
      [new Date(2017, 9, 1, 1, 31, 4, 12), 0.0004612, 7, Buffer.from('05c422ceb80c', 'hex')],
      [new Date(2017, 7, 3, 12, 52, 28, 373), 0.0007118, 7, Buffer.from('051e94c8e96b', 'hex')]
    ]) {
      const parameter = { value: value, scale: scale };
      parameter.value.nanosecondDelta = nanosecondDelta;

      const buffer = new WritableTrackingBuffer(0);
      type.writeParameterData(buffer, parameter, { useUTC: false }, () => { });
      assert.deepEqual(buffer.data, expectedBuffer);
    }
  });

  it('should writeParameterData BigInt (Buffer)', function(done) {
    const value = 123456789;
    const expected = Buffer.from('0815cd5b0700000000', 'hex');

    const type = TYPES.typeByName.BigInt;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length: 4 };
    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);

      done();
    });
  });

  it('should writeParameterData BigInt (null)', function(done) {
    const value = null;
    const expected = Buffer.from('00', 'hex');

    const type = TYPES.typeByName.BigInt;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length: 4 };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);

      done();
    });
  });

  it('should writeParameterData binary (Buffer)', function(done) {
    const value = Buffer.from([0x12, 0x34, 0x00, 0x00]);
    const expected =Buffer.from('040012340000', 'hex');

    const type = TYPES.typeByName.Binary;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length: 4 };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);

      done();
    });
  });

  it('should writeParameterData binary (Null)', function(done) {
    const value = null;
    const expected =Buffer.from('ffff', 'hex');

    const type = TYPES.typeByName.Binary;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length: 4 };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);

      done();
    });
  });

  it('should writeParameterData Bit (Buffer)', function(done) {
    const value = 1;
    const expected = Buffer.from('0101', 'hex');

    const type = TYPES.typeByName.Bit;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData Bit (Null)', function(done) {
    const value = null;
    const expected = Buffer.from('00', 'hex');

    const type = TYPES.typeByName.Bit;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData Bit (Undefined)', function(done) {
    const value = undefined;
    const expected = Buffer.from('00', 'hex');

    const type = TYPES.typeByName.Bit;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData Char (Buffer)', function(done) {
    const value = Buffer.from([0xff, 0xff, 0xff, 0xff]);
    const expected =  Buffer.from('0400ffffffff', 'hex');

    const type = TYPES.typeByName.Char;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData Char (Null)', function(done) {
    const value = null;
    const expected = Buffer.from('ffff', 'hex');

    const type = TYPES.typeByName.Char;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });
  
  it('should writeParameterData DateTimeOffSet (Buffer)', function(done) {
    const value = new Date(Date.UTC(2014, 1, 14, 17, 59, 59, 999));
    const expected = Buffer.from('0820fd002d380b20fe', 'hex');

    const type = TYPES.typeByName.DateTimeOffset;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, scale: 0 };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData DateTimeOffSet (Null)', function(done) {
    const value = null;
    const expected =  Buffer.from('00', 'hex');

    const type = TYPES.typeByName.DateTimeOffset;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, scale: 0 };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData Decimal (Precision <= 9)', function(done) {
    const value = 1.23;
    const expected =  Buffer.from('050101000000', 'hex');
    const precision = 1;

    const type = TYPES.typeByName.Decimal;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, precision, scale: 0 };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData Decimal (Precision <= 19)', function(done) {
    const value = 1.23;
    const expected =   Buffer.from('09010100000000000000', 'hex');
    const precision = 15;

    const type = TYPES.typeByName.Decimal;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, precision, scale: 0 };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData Decimal (Precision <= 28)', function(done) {
    const value = 1.23;
    const expected =  Buffer.from('0d01010000000000000000000000', 'hex');
    const precision = 25;

    const type = TYPES.typeByName.Decimal;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, precision, scale: 0 };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });


  it('should writeParameterData Decimal (Precision > 28)', function(done) {
    const value = 1.23;
    const expected =  Buffer.from('110101000000000000000000000000000000', 'hex');
    const precision = 30;

    const type = TYPES.typeByName.Decimal;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, precision, scale: 0 };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData Float (Buffer)', function(done) {
    const value = 1.2345;
    const expected = Buffer.from('088d976e1283c0f33f', 'hex');

    const type = TYPES.typeByName.Float;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, scale: 0 };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData Float (Null)', function(done) {
    const value = null;
    const expected = Buffer.from('00', 'hex');

    const type = TYPES.typeByName.Float;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, scale: 0 };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData Image (Buffer)', function(done) {
    const value = Buffer.from('010101', 'hex');
    const expected = Buffer.from('64000000010101', 'hex');

    const type = TYPES.typeByName.Image;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length: 100 };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData Image (Null)', function(done) {
    const value = null;
    const expected =  Buffer.from('64000000', 'hex');

    const type = TYPES.typeByName.Image;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length: 100 };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData Int (Buffer)', function(done) {
    const value = 1234;
    const expected = Buffer.from('04d2040000', 'hex');

    const type = TYPES.typeByName.Int;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData Int (Null)', function(done) {
    const value = null;
    const expected = Buffer.from('00', 'hex');

    const type = TYPES.typeByName.Int;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData Money (Buffer)', function(done) {
    const value = 1234;
    const expected = Buffer.from('0800000000204bbc00', 'hex');

    const type = TYPES.typeByName.Money;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData Money (Null)', function(done) {
    const value = null;
    const expected = Buffer.from('00', 'hex');

    const type = TYPES.typeByName.Money;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData NChar (Buffer)', function(done) {
    const value = Buffer.from([0xff, 0xff, 0xff, 0xff]);
    const expected = Buffer.from('0400ffffffff', 'hex');

    const type = TYPES.typeByName.NChar;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData NChar (Buffer)', function(done) {
    const value = null;
    const expected = Buffer.from('ffff', 'hex');

    const type = TYPES.typeByName.NChar;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData Numeric (Precision <= 9)', function(done) {
    const value = 1.23;
    const expected = Buffer.from('050101000000', 'hex');
    const precision = 1;

    const type = TYPES.typeByName.Numeric;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, precision, scale: 0 };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData Numeric (Precision <= 19)', function(done) {
    const value = 1.23;
    const expected = Buffer.from('09010100000000000000', 'hex');
    const precision = 15;

    const type = TYPES.typeByName.Numeric;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, precision, scale: 0 };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData Numeric (Precision <= 28)', function(done) {
    const value = 1.23;
    const expected = Buffer.from('0d01010000000000000000000000', 'hex');
    const precision = 25;

    const type = TYPES.typeByName.Numeric;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, precision, scale: 0 };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData Numeric (Precision > 28)', function(done) {
    const value = 1.23;
    const expected = Buffer.from('110101000000000000000000000000000000', 'hex');
    const precision = 30;

    const type = TYPES.typeByName.Numeric;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, precision, scale: 0 };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });


  it('should writeParameterData NVarChar (Buffer, Length <= Maximum Length )', function(done) {
    const value = Buffer.from([0xff, 0xff]);
    const expected = Buffer.from('0200ffff', 'hex');
    const length = 1;

    const type = TYPES.typeByName.NVarChar;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData NVarChar (Buffer, Length > Maximum Length )', function(done) {
    const value = Buffer.from([0xff, 0xff]);
    const expected = Buffer.from('feffffffffffffff02000000ffff00000000', 'hex');
    const length = 4100;

    const type = TYPES.typeByName.NVarChar;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData NVarChar (Null, Length <= Maximum Length )', function(done) {
    const value = null;
    const expected = Buffer.from('ffff', 'hex');
    const length = 1;

    const type = TYPES.typeByName.NVarChar;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData NVarChar (Null, Length > Maximum Length )', function(done) {
    const value = null;
    const expected =  Buffer.from('ffffffffffffffff', 'hex');
    const length = 5000;

    const type = TYPES.typeByName.NVarChar;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  
  it('should writeParameterData Real (Buffer)', function(done) {
    const value = 123.123;
    const expected = Buffer.from('04fa3ef642', 'hex');

    const type = TYPES.typeByName.Real;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData Real (Null)', function(done) {
    const value = null;
    const expected =  Buffer.from('00', 'hex');

    const type = TYPES.typeByName.Real;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData SmallInt (Buffer)', function(done) {
    const value = 2;
    const expected =  Buffer.from('020200', 'hex');

    const type = TYPES.typeByName.SmallInt;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData SmallInt (Null)', function(done) {
    const value = null;
    const expected = Buffer.from('00', 'hex');

    const type = TYPES.typeByName.SmallInt;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData SmallMoney (Buffer)', function(done) {
    const value = 2;
    const expected = Buffer.from('04204e0000', 'hex');

    const type = TYPES.typeByName.SmallMoney;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData SmallMoney (Null)', function(done) {
    const value = null;
    const expected = Buffer.from('00', 'hex');

    const type = TYPES.typeByName.SmallMoney;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData Text (Buffer)', function(done) {
    const value = Buffer.from('Hello World', 'ascii');
    const expected =  Buffer.from('00000000000f00000048656c6c6f20576f726c64', 'hex');

    const type = TYPES.typeByName.Text;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length: 15  };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData Text (Null)', function(done) {
    const value = null;
    const expected = Buffer.from('00000000000f000000', 'hex');

    const type = TYPES.typeByName.Text;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length: 15  };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData TinyInt (Buffer)', function(done) {
    const value = 1;
    const expected = Buffer.from('0101', 'hex');

    const type = TYPES.typeByName.TinyInt;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value  };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData TinyInt (Null)', function(done) {
    const value = null;
    const expected =  Buffer.from('00', 'hex');

    const type = TYPES.typeByName.TinyInt;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value  };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData TVP (Buffer)', function(done) {
    const value = {
      columns: [{ name: 'user_id', type: TYPES.typeByName.Int }],
      rows: [[ 15 ]]
    };
    const expected =  Buffer.from('01000000000000002604000001040f00000000', 'hex');

    const type = TYPES.typeByName.TVP;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value  };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData TVP (Null)', function(done) {
    const value =null;

    const expected = Buffer.from('ffff0000', 'hex');

    const type = TYPES.typeByName.TVP;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value  };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData UniqueIdentifier (Buffer)', function(done) {
    const value ='e062ae34-6de5-47f3-8ba3-29d25f77e71a';

    const expected = Buffer.from('1034ae62e0e56df3478ba329d25f77e71a', 'hex');

    const type = TYPES.typeByName.UniqueIdentifier;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData UniqueIdentifier (Null)', function(done) {
    const value = null;

    const expected = Buffer.from('00', 'hex');

    const type = TYPES.typeByName.UniqueIdentifier;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });


  it('should writeParameterData varbinary', () => {
    const type = TYPES.typeByName.VarBinary;
    for (const [value, length, expected] of [
      [1, 1, Buffer.from('02003100', 'hex')],
      [null, 1, Buffer.from('ffff', 'hex')],
      [null, 9000, Buffer.from('FFFFFFFFFFFFFFFF', 'hex')]
    ]) {
      const buffer = new WritableTrackingBuffer(0);
      const parameterValue = { value, length };
      type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => { })
      assert.isTrue(buffer.data.equals(expected));
    }
  });

  it('should writeParameterData VarBinary (Buffer, Length <= Maximum Length)', function(done) {
    const value = 1;
    const length = 1;
    const expected =  Buffer.from('02003100', 'hex');
    const type = TYPES.typeByName.VarBinary;
    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length};

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  
  it('should writeParameterData VarBinary (Buffer, Length > Maximum Length)', function(done) {
    const value = 1;
    const length = 9000;
    const expected =  Buffer.from('feffffffffffffff02000000310000000000', 'hex');
    const type = TYPES.typeByName.VarBinary;
    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length};

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData VarBinary (Null, Length <= Maximum Length)', function(done) {
    const value = null;
    const length = 1;
    const expected = Buffer.from('ffff', 'hex');
    const type = TYPES.typeByName.VarBinary;
    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length};

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData VarBinary (Null, Length > Maximum Length)', function(done) {
    const value = null;
    const length = 9000;
    const expected = Buffer.from('FFFFFFFFFFFFFFFF', 'hex');
    const type = TYPES.typeByName.VarBinary;
    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length};

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData VarChar (Buffer, Length <= Maximum Length)', function(done) {
    const value = 'hello world';
    const length = 1;
    const expected = Buffer.from('0b0068656c6c6f20776f726c64', 'hex');
    const type = TYPES.typeByName.VarChar;
    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length};

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData VarChar (Buffer, Length > Maximum Length)', function(done) {
    const value = 'hello world';
    const length = 9000;
    const expected = Buffer.from('feffffffffffffff0b00000068656c6c6f20776f726c6400000000', 'hex');
    const type = TYPES.typeByName.VarChar;
    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length};

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData VarChar (Null, Length <= Maximum Length)', function(done) {
    const value = null;
    const length = 1;
    const expected = Buffer.from('ffff', 'hex');
    const type = TYPES.typeByName.VarChar;
    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length};

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData VarChar (Null, Length > Maximum Length)', function(done) {
    const value = null;
    const length = 9000;
    const expected = Buffer.from('FFFFFFFFFFFFFFFF', 'hex');
    const type = TYPES.typeByName.VarChar;
    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length};

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });
});
