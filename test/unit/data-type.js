const TYPES = require('../../src/data-type');
const WritableTrackingBuffer = require('../../src/tracking-buffer/writable-tracking-buffer');
const assert = require('chai').assert;

describe('Data Types', function() {
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

  it('should writeTypeInfo DateTime', function() {
    const buffer = new WritableTrackingBuffer(2);
    const type = TYPES.typeByName.DateTime;
    const expected = Buffer.from([0x6F, 8]);

    type.writeTypeInfo(buffer);
    assert.deepEqual(buffer.data, expected);
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
      assert.strictEqual(buffer.data.readInt32LE(1), expectedNoOfDays);
    }
  });

  it('should writeTypeInfo DateTime2', function() {
    const buffer = new WritableTrackingBuffer(2);
    const type = TYPES.typeByName.DateTime2;
    const expected = Buffer.from([0x2A, 1]);

    type.writeTypeInfo(buffer, { scale: 1 });
    assert.deepEqual(buffer.data, expected);
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
      assert.deepEqual(buffer.data, expectedBuffer);
    }
  });

  it('should writeTypeInfo Date', function() {
    const buffer = new WritableTrackingBuffer(2);
    const type = TYPES.typeByName.Date;
    const expected = Buffer.from([0x28]);

    type.writeTypeInfo(buffer);
    assert.deepEqual(buffer.data, expected);
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

  it('should writeTypeInfo Time', function() {
    const buffer = new WritableTrackingBuffer(2);
    const type = TYPES.typeByName.Time;
    const expected = Buffer.from([0x29, 1]);

    type.writeTypeInfo(buffer, { scale: 1 });
    assert.deepEqual(buffer.data, expected);
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

  it('should writeTypeInfo BigInt', function() {
    const buffer = new WritableTrackingBuffer(2);
    const type = TYPES.typeByName.BigInt;

    const expected = Buffer.from([0x26, 8]);

    type.writeTypeInfo(buffer);
    assert.deepEqual(buffer.data, expected);
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

  it('should writeTypeInfo Binary', function() {
    const buffer = new WritableTrackingBuffer(2);
    const type = TYPES.typeByName.Binary;
    const parameter = { length: 1 };

    const expected = Buffer.from([0xAD, 1, 0]);

    type.writeTypeInfo(buffer, parameter);
    assert.deepEqual(buffer.data, expected);
  });

  it('should writeParameterData Binary (Buffer)', function(done) {
    const value = Buffer.from([0x12, 0x34, 0x00, 0x00]);
    const expected = Buffer.from('040012340000', 'hex');

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
    const expected = Buffer.from('ffff', 'hex');

    const type = TYPES.typeByName.Binary;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length: 4 };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);

      done();
    });
  });

  it('should writeTypeInfo Bit', function() {
    const buffer = new WritableTrackingBuffer(2);
    const type = TYPES.typeByName.Bit;
    const expected = Buffer.from([0x68, 1]);

    type.writeTypeInfo(buffer);
    assert.deepEqual(buffer.data, expected);
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

  it('should writeTypeInfo Char', function() {
    const buffer = new WritableTrackingBuffer(2);
    const type = TYPES.typeByName.Char;
    const expected = Buffer.from([0xAF, 1, 0, 0x00, 0x00, 0x00, 0x00, 0x00]);

    type.writeTypeInfo(buffer, { length: 1 });
    assert.deepEqual(buffer.data, expected);
  });

  it('should writeParameterData Char (Buffer)', function(done) {
    const value = Buffer.from([0xff, 0xff, 0xff, 0xff]);
    const expected = Buffer.from('0400ffffffff', 'hex');

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

  it('should writeTypeInfo DateTimeOffset', function() {
    const buffer = new WritableTrackingBuffer(2);
    const type = TYPES.typeByName.DateTimeOffset;
    const expected = Buffer.from([0x2B, 1]);

    type.writeTypeInfo(buffer, { scale: 1 });
    assert.deepEqual(buffer.data, expected);
  });

  it('should writeParameterData DateTimeOffSet (Buffer)', function(done) {
    const value = new Date(Date.UTC(2014, 1, 14, 17, 59, 59, 999));
    const expected = Buffer.from('0820fd002d380b', 'hex');

    const type = TYPES.typeByName.DateTimeOffset;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, scale: 0 };

    type.writeParameterData(buffer, parameterValue, { useUTC: true }, () => {
      assert.deepEqual(buffer.data.slice(0, 7), expected);
      done();
    });
  });

  it('should writeParameterData DateTimeOffSet (Null)', function(done) {
    const value = null;
    const expected = Buffer.from('00', 'hex');

    const type = TYPES.typeByName.DateTimeOffset;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, scale: 0 };

    type.writeParameterData(buffer, parameterValue, { useUTC: true }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeTypeInfo Decimal ', function() {
    const type = TYPES.typeByName.Decimal;

    // Precision <= 9
    const buffer1 = new WritableTrackingBuffer(4);
    const expected1 = Buffer.from([0x6A, 5, 1, 1]);
    type.writeTypeInfo(buffer1, { precision: 1, scale: 1 });
    assert.deepEqual(buffer1.data, expected1);

    // Precision <= 19
    const buffer2 = new WritableTrackingBuffer(4);
    const expected2 = Buffer.from([0x6A, 9, 15, 1]);
    type.writeTypeInfo(buffer2, { precision: 15, scale: 1 });
    assert.deepEqual(buffer2.data, expected2);


    // Precision <= 28
    const buffer3 = new WritableTrackingBuffer(4);
    const expected3 = Buffer.from([0x6A, 13, 20, 1]);
    type.writeTypeInfo(buffer3, { precision: 20, scale: 1 });
    assert.deepEqual(buffer3.data, expected3);

    // Precision > 28
    const buffer4 = new WritableTrackingBuffer(4);
    const expected4 = Buffer.from([0x6A, 17, 30, 1]);
    type.writeTypeInfo(buffer4, { precision: 30, scale: 1 });
    assert.deepEqual(buffer4.data, expected4);
  });

  it('should writeParameterData Decimal (Precision <= 9)', function(done) {
    const value = 1.23;
    const expected = Buffer.from('050101000000', 'hex');
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
    const expected = Buffer.from('09010100000000000000', 'hex');
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
    const expected = Buffer.from('0d01010000000000000000000000', 'hex');
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
    const expected = Buffer.from('110101000000000000000000000000000000', 'hex');
    const precision = 30;

    const type = TYPES.typeByName.Decimal;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, precision, scale: 0 };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });


  it('should writeTypeInfo Float', function() {
    const buffer = new WritableTrackingBuffer(2);
    const type = TYPES.typeByName.Float;
    const expected = Buffer.from([0x6D, 8]);

    type.writeTypeInfo(buffer);
    assert.deepEqual(buffer.data, expected);
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

  it('should writeTypeInfo Image', function() {
    const buffer = new WritableTrackingBuffer(5);
    const type = TYPES.typeByName.Image;
    const expected = Buffer.from([0x22, 1, 0, 0, 0]);

    type.writeTypeInfo(buffer, { length: 1 });
    assert.deepEqual(buffer.data, expected);
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
    const expected = Buffer.from('64000000', 'hex');

    const type = TYPES.typeByName.Image;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length: 100 };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeTypeInfo Int', function() {
    const buffer = new WritableTrackingBuffer(2);
    const type = TYPES.typeByName.Int;
    const expected = Buffer.from([0x26, 4]);

    type.writeTypeInfo(buffer);
    assert.deepEqual(buffer.data, expected);
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

  it('should writeTypeInfo Money', function() {
    const buffer = new WritableTrackingBuffer(2);
    const type = TYPES.typeByName.Money;
    const expected = Buffer.from([0x6E, 8]);

    type.writeTypeInfo(buffer);
    assert.deepEqual(buffer.data, expected);
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

  it('should writeTypeInfo NChar', function() {
    const buffer = new WritableTrackingBuffer(8);
    const type = TYPES.typeByName.NChar;
    const expected = Buffer.from([0xEF, 2, 0, 0x00, 0x00, 0x00, 0x00, 0x00]);

    type.writeTypeInfo(buffer, { length: 1 });
    assert.deepEqual(buffer.data, expected);
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


  it('should writeTypeInfo Numeric', function() {
    const type = TYPES.typeByName.Numeric;

    // Precision <= 9
    const buffer1 = new WritableTrackingBuffer(4);
    const expected1 = Buffer.from([0x6C, 5, 1, 1]);
    type.writeTypeInfo(buffer1, { precision: 1, scale: 1 });
    assert.deepEqual(buffer1.data, expected1);

    // Precision <= 19
    const buffer2 = new WritableTrackingBuffer(4);
    const expected2 = Buffer.from([0x6C, 9, 15, 1]);
    type.writeTypeInfo(buffer2, { precision: 15, scale: 1 });
    assert.deepEqual(buffer2.data, expected2);


    // Precision <= 28
    const buffer3 = new WritableTrackingBuffer(4);
    const expected3 = Buffer.from([0x6C, 13, 20, 1]);
    type.writeTypeInfo(buffer3, { precision: 20, scale: 1 });
    assert.deepEqual(buffer3.data, expected3);

    // Precision > 28
    const buffer4 = new WritableTrackingBuffer(4);
    const expected4 = Buffer.from([0x6C, 17, 30, 1]);
    type.writeTypeInfo(buffer4, { precision: 30, scale: 1 });
    assert.deepEqual(buffer4.data, expected4);
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


  it('should writeTypeInfo NVarChar', function() {
    // Length <= Maximum Length
    const buffer = new WritableTrackingBuffer(8);
    const type = TYPES.typeByName.NVarChar;
    const expected = Buffer.from([0xE7, 2, 0, 0x00, 0x00, 0x00, 0x00, 0x00]);

    type.writeTypeInfo(buffer, { length: 1 });
    assert.deepEqual(buffer.data, expected);

    // Length > Maximum Length
    const buffer1 = new WritableTrackingBuffer(8);
    const expected1 = Buffer.from([0xE7, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00]);

    type.writeTypeInfo(buffer1, { length: 4100 });
    assert.deepEqual(buffer1.data, expected1);
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
    const expected = Buffer.from('ffffffffffffffff', 'hex');
    const length = 5000;

    const type = TYPES.typeByName.NVarChar;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeTypeInfo Real', function() {
    const buffer = new WritableTrackingBuffer(2);
    const type = TYPES.typeByName.Real;
    const expected = Buffer.from([0x6D, 4]);

    type.writeTypeInfo(buffer);
    assert.deepEqual(buffer.data, expected);
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
    const expected = Buffer.from('00', 'hex');

    const type = TYPES.typeByName.Real;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeTypeInfo SmallInt', function() {
    const buffer = new WritableTrackingBuffer(2);
    const type = TYPES.typeByName.SmallInt;
    const expected = Buffer.from([0x26, 2]);

    type.writeTypeInfo(buffer);
    assert.deepEqual(buffer.data, expected);
  });

  it('should writeParameterData SmallInt (Buffer)', function(done) {
    const value = 2;
    const expected = Buffer.from('020200', 'hex');

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

  it('should writeTypeInfo SmallMoney', function() {
    const buffer = new WritableTrackingBuffer(2);
    const type = TYPES.typeByName.SmallMoney;
    const expected = Buffer.from([0x6E, 4]);

    type.writeTypeInfo(buffer);
    assert.deepEqual(buffer.data, expected);
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

  it('should writeTypeInfo Text', function() {
    const buffer = new WritableTrackingBuffer(2);
    const type = TYPES.typeByName.Text;
    const expected = Buffer.from([0x23, 1, 0, 0, 0]);

    type.writeTypeInfo(buffer, { length: 1 });
    assert.deepEqual(buffer.data, expected);
  });

  it('should writeParameterData Text (Buffer)', function(done) {
    const value = Buffer.from('Hello World', 'ascii');
    const expected = Buffer.from('00000000000f00000048656c6c6f20576f726c64', 'hex');

    const type = TYPES.typeByName.Text;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length: 15 };

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
    const parameterValue = { value, length: 15 };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeTypeInfo TinyInt', function() {
    const buffer = new WritableTrackingBuffer(2);
    const type = TYPES.typeByName.TinyInt;
    const expected = Buffer.from([0x26, 1]);

    type.writeTypeInfo(buffer);
    assert.deepEqual(buffer.data, expected);
  });


  it('should writeParameterData TinyInt (Buffer)', function(done) {
    const value = 1;
    const expected = Buffer.from('0101', 'hex');

    const type = TYPES.typeByName.TinyInt;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData TinyInt (Null)', function(done) {
    const value = null;
    const expected = Buffer.from('00', 'hex');

    const type = TYPES.typeByName.TinyInt;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeTypeInfo TVP', function() {
    const buffer = new WritableTrackingBuffer(2);
    const type = TYPES.typeByName.TVP;
    const expected = Buffer.from([0xF3, 0x00, 0x00, 0x00]);

    type.writeTypeInfo(buffer, { value: null });
    assert.deepEqual(buffer.data, expected);
  });

  it('should writeParameterData TVP (Buffer)', function(done) {
    const value = {
      columns: [{ name: 'user_id', type: TYPES.typeByName.Int }],
      rows: [[ 15 ]]
    };
    const expected = Buffer.from('01000000000000002604000001040f00000000', 'hex');

    const type = TYPES.typeByName.TVP;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeParameterData TVP (Null)', function(done) {
    const value = null;

    const expected = Buffer.from('ffff0000', 'hex');

    const type = TYPES.typeByName.TVP;

    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeTypeInfo UniqueIdentifier', function() {
    const buffer = new WritableTrackingBuffer(2);
    const type = TYPES.typeByName.UniqueIdentifier;
    const expected = Buffer.from([0x24, 0x10]);

    type.writeTypeInfo(buffer);
    assert.deepEqual(buffer.data, expected);
  });

  it('should writeParameterData UniqueIdentifier (Buffer)', function(done) {
    const value = 'e062ae34-6de5-47f3-8ba3-29d25f77e71a';

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

  it('should writeTypeInfo VarBinary', function() {
    const type = TYPES.typeByName.VarBinary;

    // Length <= Maximum Length
    const buffer = new WritableTrackingBuffer(2);
    const expected = Buffer.from([0xA5, 0x40, 0x1F]);

    type.writeTypeInfo(buffer, { length: 1 });
    assert.deepEqual(buffer.data, expected);

    // Length > Maximum Length
    const buffer1 = new WritableTrackingBuffer(2);
    const expected1 = Buffer.from([0xA5, 0xFF, 0xFF]);

    type.writeTypeInfo(buffer1, { length: 8500 });
    assert.deepEqual(buffer1.data, expected1);
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
      type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => { });
      assert.isTrue(buffer.data.equals(expected));
    }
  });

  it('should writeParameterData VarBinary (Buffer, Length <= Maximum Length)', function(done) {
    const value = 1;
    const length = 1;
    const expected = Buffer.from('02003100', 'hex');
    const type = TYPES.typeByName.VarBinary;
    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });


  it('should writeParameterData VarBinary (Buffer, Length > Maximum Length)', function(done) {
    const value = 1;
    const length = 9000;
    const expected = Buffer.from('feffffffffffffff02000000310000000000', 'hex');
    const type = TYPES.typeByName.VarBinary;
    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length };

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
    const parameterValue = { value, length };

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
    const parameterValue = { value, length };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });

  it('should writeTypeInfo VarChar', function() {
    const type = TYPES.typeByName.VarChar;

    // Length <= Maximum Length
    const buffer = new WritableTrackingBuffer(2);
    const expected = Buffer.from('a7401f0000000000', 'hex');

    type.writeTypeInfo(buffer, { length: 1 });
    assert.deepEqual(buffer.data, expected);

    // Length > Maximum Length
    const buffer1 = new WritableTrackingBuffer(2);
    const expected1 = Buffer.from('a7ffff0000000000', 'hex');

    type.writeTypeInfo(buffer1, { length: 8500 });
    assert.deepEqual(buffer1.data, expected1);
  });

  it('should writeParameterData VarChar (Buffer, Length <= Maximum Length)', function(done) {
    const value = 'hello world';
    const length = 1;
    const expected = Buffer.from('0b0068656c6c6f20776f726c64', 'hex');
    const type = TYPES.typeByName.VarChar;
    const buffer = new WritableTrackingBuffer(0);
    const parameterValue = { value, length };

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
    const parameterValue = { value, length };

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
    const parameterValue = { value, length };

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
    const parameterValue = { value, length };

    type.writeParameterData(buffer, parameterValue, { useUTC: false }, () => {
      assert.deepEqual(buffer.data, expected);
      done();
    });
  });
});

describe('DataType.toBuffer', () => {
  const emptyBuffer = Buffer.from([]);

  const undefinedValueCase = {
    name: 'value is undefined',
    parameter: {},
    expected: undefined,
  };
  const nullValueCase = {
    name: 'value is null',
    parameter: { value: null },
    expected: undefined,
  };

  describe('TinyInt.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is a tiny int',
        parameter: { value: 12 },
        expected: Buffer.from([ 0x0C, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
      },
      {
        name: 'value is a tiny int string',
        parameter: { value: '12' },
        expected: Buffer.from([ 0x0C, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.TinyInt.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('SmallInt.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is a small int',
        parameter: { value: 1234 },
        expected: Buffer.from([ 0xD2, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
      },
      {
        name: 'value is a small int string',
        parameter: { value: '1234' },
        expected: Buffer.from([ 0xD2, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.SmallInt.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('Int.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is an int',
        parameter: { value: 123456 },
        expected: Buffer.from([ 0x40, 0xE2, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
      },
      {
        name: 'value is an int string',
        parameter: { value: '123456' },
        expected: Buffer.from([ 0x40, 0xE2, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.Int.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('BigInt.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is a big int number',
        parameter: { value: 123456789 },
        expected: Buffer.from([ 0x15, 0xCD, 0x5B, 0x07, 0x00, 0x00, 0x00, 0x00 ]),
      },
      {
        name: 'value is a big int string',
        parameter: { value: '123456789' },
        expected: Buffer.from([ 0x15, 0xCD, 0x5B, 0x07, 0x00, 0x00, 0x00, 0x00 ]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.BigInt.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('Real.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is a float number',
        parameter: { value: 1234.5678 },
        expected: Buffer.from([ 0x2B, 0x52, 0x9A, 0x44 ]),
      },
      {
        name: 'value is a float string',
        parameter: { value: '1234.5678' },
        expected: Buffer.from([ 0x2B, 0x52, 0x9A, 0x44 ]),
      },
      {
        name: 'value is a float in scientific format',
        parameter: { value: '12345678e-4' },
        expected: Buffer.from([ 0x2B, 0x52, 0x9A, 0x44 ]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.Real.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('Float.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is a float number',
        parameter: { value: 1234.5678 },
        expected: Buffer.from([ 0xAD, 0xFA, 0x5C, 0x6D, 0x45, 0x4A, 0x93, 0x40 ]),
      },
      {
        name: 'value is a float string',
        parameter: { value: '1234.5678' },
        expected: Buffer.from([ 0xAD, 0xFA, 0x5C, 0x6D, 0x45, 0x4A, 0x93, 0x40 ]),
      },
      {
        name: 'value is a float in scientific format',
        parameter: { value: '12345678e-4' },
        expected: Buffer.from([ 0xAD, 0xFA, 0x5C, 0x6D, 0x45, 0x4A, 0x93, 0x40 ]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.Float.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('SmallMoney.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is a float number',
        parameter: { value: 1234.5678 },
        expected: Buffer.from([ 0x00, 0x00, 0x00, 0x00, 0x4E, 0x61, 0xBC, 0x00 ]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.SmallMoney.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('Money.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is a float number',
        parameter: { value: 12345678.1234 },
        expected: Buffer.from([ 0x1C, 0x00, 0x00, 0x00, 0xB2, 0xFB, 0x98, 0xBE ]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.Money.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('Bit.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is true',
        parameter: { value: true },
        expected: Buffer.from([ 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
      },
      {
        name: 'value is false',
        parameter: { value: false },
        expected: Buffer.from([ 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
      },
      {
        name: 'value is truthy',
        parameter: { value: 'test' },
        expected: Buffer.from([ 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
      },
      {
        name: 'value is falsy',
        parameter: { value: '' },
        expected: Buffer.from([ 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.Bit.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('VarChar.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is empty string',
        parameter: { value: '' },
        expected: emptyBuffer,
      },
      {
        name: 'value is empty buffer',
        parameter: { value: emptyBuffer },
        expected: emptyBuffer,
      },
      {
        name: 'value is printable string',
        parameter: { value: 'test' },
        expected: Buffer.from('test'),
      },
      {
        name: 'value is binary string',
        parameter: { value: '\x12\x34\x56\x78' },
        expected: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]),
      },
      {
        name: 'value is binary buffer',
        parameter: { value: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]) },
        expected: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.VarChar.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('Char.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is empty string',
        parameter: { value: '' },
        expected: emptyBuffer,
      },
      {
        name: 'value is empty buffer',
        parameter: { value: emptyBuffer },
        expected: emptyBuffer,
      },
      {
        name: 'value is printable string',
        parameter: { value: 'test' },
        expected: Buffer.from('test'),
      },
      {
        name: 'value is binary string',
        parameter: { value: '\x12\x34\x56\x78' },
        expected: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]),
      },
      {
        name: 'value is binary buffer',
        parameter: { value: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]) },
        expected: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.Char.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('NVarChar.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is empty string',
        parameter: { value: '' },
        expected: emptyBuffer,
      },
      {
        name: 'value is empty buffer',
        parameter: { value: emptyBuffer },
        expected: emptyBuffer,
      },
      {
        name: 'value is printable string',
        parameter: { value: 'test' },
        expected: Buffer.from('test', 'ucs2'),
      },
      {
        name: 'value is binary string',
        parameter: { value: '\x12\x34\x56\x78' },
        expected: Buffer.from([ 0x12, 0x00, 0x34, 0x00, 0x56, 0x00, 0x78, 0x00 ]),
      },
      {
        name: 'value is binary buffer',
        parameter: { value: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]) },
        expected: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.NVarChar.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('NChar.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is empty string',
        parameter: { value: '' },
        expected: emptyBuffer,
      },
      {
        name: 'value is empty buffer',
        parameter: { value: emptyBuffer },
        expected: emptyBuffer,
      },
      {
        name: 'value is printable string',
        parameter: { value: 'test' },
        expected: Buffer.from('test', 'ucs2'),
      },
      {
        name: 'value is binary string',
        parameter: { value: '\x12\x34\x56\x78' },
        expected: Buffer.from([ 0x12, 0x00, 0x34, 0x00, 0x56, 0x00, 0x78, 0x00 ]),
      },
      {
        name: 'value is binary buffer',
        parameter: { value: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]) },
        expected: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.NChar.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('VarBinary.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is empty string',
        parameter: { value: '' },
        expected: emptyBuffer,
      },
      {
        name: 'value is empty buffer',
        parameter: { value: emptyBuffer },
        expected: emptyBuffer,
      },
      {
        name: 'value is printable string',
        parameter: { value: 'test' },
        expected: Buffer.from('test'),
      },
      {
        name: 'value is binary string',
        parameter: { value: '\x12\x34\x56\x78' },
        expected: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]),
      },
      {
        name: 'value is binary buffer',
        parameter: { value: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]) },
        expected: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.VarBinary.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('Binary.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is empty string',
        parameter: { value: '' },
        expected: emptyBuffer,
      },
      {
        name: 'value is empty buffer',
        parameter: { value: emptyBuffer },
        expected: emptyBuffer,
      },
      {
        name: 'value is printable string',
        parameter: { value: 'test' },
        expected: Buffer.from('test'),
      },
      {
        name: 'value is binary string',
        parameter: { value: '\x12\x34\x56\x78' },
        expected: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]),
      },
      {
        name: 'value is binary buffer',
        parameter: { value: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]) },
        expected: Buffer.from([ 0x12, 0x34, 0x56, 0x78 ]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.Binary.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('SmallDateTime.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is utc date, with use utc true',
        parameter: { value: new Date(Date.UTC(1970, 1, 23, 12, 0, 0)) },
        options: { useUTC: true },
        expected: Buffer.from([ 0x14, 0x64, 0xD0, 0x02 ]),
      },
      {
        name: 'value is local date, with use utc false',
        parameter: { value: new Date(1970, 1, 23, 12, 0, 0) },
        options: { useUTC: false },
        expected: Buffer.from([ 0x14, 0x64, 0xD0, 0x02 ]),
      },
    ].forEach(({ name, parameter, options, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.SmallDateTime.toBuffer(parameter, options);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('DateTime.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is utc date, with use utc true',
        parameter: { value: new Date(Date.UTC(1970, 1, 23, 12, 0, 0)) },
        options: { useUTC: true },
        expected: Buffer.from([ 0x14, 0x64, 0x00, 0x00, 0x00, 0xC1, 0xC5, 0x00 ]),
      },
      {
        name: 'value is local date, with use utc false',
        parameter: { value: new Date(1970, 1, 23, 12, 0, 0) },
        options: { useUTC: false },
        expected: Buffer.from([ 0x14, 0x64, 0x00, 0x00, 0x00, 0xC1, 0xC5, 0x00 ]),
      },
    ].forEach(({ name, parameter, options, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.DateTime.toBuffer(parameter, options);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('Time.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is utc date, with use utc true',
        parameter: { value: new Date(Date.UTC(1970, 1, 23, 12, 0, 0)) },
        options: { useUTC: true },
        expected: Buffer.from([ 0x00, 0xE0, 0x34, 0x95, 0x64 ]),
      },
      {
        name: 'value is local date, with use utc false',
        parameter: { value: new Date(1970, 1, 23, 12, 0, 0) },
        options: { useUTC: false },
        expected: Buffer.from([ 0x00, 0xE0, 0x34, 0x95, 0x64 ]),
      },
      {
        name: 'value is local date, with nanoseconds',
        parameter: {
          value: Object.assign(
            new Date(1970, 1, 23, 12, 0, 0),
            { nanosecondDelta: 1234 },
          ),
        },
        options: { useUTC: false },
        expected: Buffer.from([ 0x00, 0x55, 0xBA, 0x74, 0x67 ]),
      },
    ].forEach(({ name, parameter, options, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.Time.toBuffer(parameter, options);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('Date.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is utc date, with use utc true',
        parameter: { value: new Date(Date.UTC(1970, 1, 23, 12, 0, 0)) },
        options: { useUTC: true },
        expected: Buffer.from([ 0x6F, 0xF9, 0x0A ]),
      },
      {
        name: 'value is local date, with use utc false',
        parameter: { value: new Date(1970, 1, 23, 12, 0, 0) },
        options: { useUTC: false },
        expected: Buffer.from([ 0x6F, 0xF9, 0x0A ]),
      },
    ].forEach(({ name, parameter, options, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.Date.toBuffer(parameter, options);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('DateTime2.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is utc date, with use utc true',
        parameter: { value: new Date(Date.UTC(1970, 1, 23, 12, 0, 0)) },
        options: { useUTC: true },
        expected: Buffer.from([ 0x00, 0xE0, 0x34, 0x95, 0x64, 0x6F, 0xF9, 0x0A ]),
      },
      {
        name: 'value is local date, with use utc false',
        parameter: { value: new Date(1970, 1, 23, 12, 0, 0) },
        options: { useUTC: false },
        expected: Buffer.from([ 0x00, 0xE0, 0x34, 0x95, 0x64, 0x6F, 0xF9, 0x0A ]),
      },
      {
        name: 'value is local date, with nanoseconds',
        parameter: {
          value: Object.assign(
            new Date(1970, 1, 23, 12, 0, 0),
            { nanosecondDelta: 1234 },
          ),
        },
        options: { useUTC: false },
        expected: Buffer.from([ 0x00, 0x55, 0xBA, 0x74, 0x67, 0x6F, 0xF9, 0x0A ]),
      },
    ].forEach(({ name, parameter, options, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.DateTime2.toBuffer(parameter, options);
        assert.deepEqual(actual, expected);
      });
    });
  });

  // DateTimeOffset is already tested by Date, and only has the additional time-zone offset
  // Adding a portable, dynamic test for it wouldn't really be testing much, so skip it

  describe('Numeric.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is a float number',
        parameter: { value: 1234.5678 },
        expected: Buffer.from([ 0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
      },
      {
        name: 'value is a float string',
        parameter: { value: '1234.5678' },
        expected: Buffer.from([ 0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
      },
      {
        name: 'value is a float in scientific format',
        parameter: { value: '12345678e-4' },
        expected: Buffer.from([ 0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
      },
      {
        name: 'value is a float, with a specific scale',
        parameter: { value: 0.12345678, scale: 4 },
        expected: Buffer.from([ 0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.Numeric.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('Decimal.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is a float number',
        parameter: { value: 1234.5678 },
        expected: Buffer.from([ 0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
      },
      {
        name: 'value is a float string',
        parameter: { value: '1234.5678' },
        expected: Buffer.from([ 0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
      },
      {
        name: 'value is a float in scientific format',
        parameter: { value: '12345678e-4' },
        expected: Buffer.from([ 0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
      },
      {
        name: 'value is a float, with a specific scale',
        parameter: { value: 0.12345678, scale: 4 },
        expected: Buffer.from([ 0x01, 0xD3, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.Decimal.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('UniqueIdentifier.toBuffer', () => {
    [
      undefinedValueCase,
      nullValueCase,
      {
        name: 'value is an upper-case guid',
        parameter: { value: 'ABCD1234-ABCD-1234-ABCD-1234567890AB' },
        expected: Buffer.from([
          0x34, 0x12, 0xCD, 0xAB, 0xCD, 0xAB, 0x34, 0x12,
          0xAB, 0xCD, 0x12, 0x34, 0x56, 0x78, 0x90, 0xAB,
        ]),
      },
      {
        name: 'value is a lower-case guid',
        parameter: { value: 'abcd1234-abcd-1234-abcd-1234567890ab' },
        expected: Buffer.from([
          0x34, 0x12, 0xCD, 0xAB, 0xCD, 0xAB, 0x34, 0x12,
          0xAB, 0xCD, 0x12, 0x34, 0x56, 0x78, 0x90, 0xAB,
        ]),
      },
      {
        name: 'value is a mixed-case guid',
        parameter: { value: 'ABcd1234-aBcD-1234-AbCd-1234567890ab' },
        expected: Buffer.from([
          0x34, 0x12, 0xCD, 0xAB, 0xCD, 0xAB, 0x34, 0x12,
          0xAB, 0xCD, 0x12, 0x34, 0x56, 0x78, 0x90, 0xAB,
        ]),
      },
    ].forEach(({ name, parameter, expected }) => {
      it(name, () => {
        const actual = TYPES.typeByName.UniqueIdentifier.toBuffer(parameter);
        assert.deepEqual(actual, expected);
      });
    });
  });
});
