import { typeByName as TYPES } from '../../src/data-type';

import { assert } from 'chai';

describe('BigInt', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.BigInt.generateParameterLength({ value: null }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.BigInt.generateParameterLength({ value: 123 }), Buffer.from([0x08]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts `number` values', function() {
      const value = 123456789;
      const expected = Buffer.from('15cd5b0700000000', 'hex');

      const parameterValue = { value, length: 4 };
      const buffer = Buffer.concat([...TYPES.BigInt.generateParameterData(parameterValue, { useUTC: false })]);

      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `string` values', function() {
      const value = '123456789';
      const expected = Buffer.from('15cd5b0700000000', 'hex');

      const parameterValue = { value, length: 4 };
      const buffer = Buffer.concat([...TYPES.BigInt.generateParameterData(parameterValue, { useUTC: false })]);

      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const parameterValue = { value, length: 4 };

      const buffer = Buffer.concat([...TYPES.BigInt.generateParameterData(parameterValue, { useUTC: false })]);

      assert.deepEqual(buffer, expected);
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const expected = Buffer.from([0x26, 8]);

      const result = TYPES.BigInt.generateTypeInfo();
      assert.deepEqual(result, expected);
    });
  });
});

describe('Binary', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.Binary.generateParameterLength({ value: null, length: 10 }), Buffer.from([0xFF, 0xFF]));
      assert.deepEqual(TYPES.Binary.generateParameterLength({ value: Buffer.alloc(0), length: 0 }), Buffer.from([0x00, 0x00]));
      assert.deepEqual(TYPES.Binary.generateParameterLength({ value: Buffer.alloc(100), length: 100 }), Buffer.from([0x64, 0x00]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts `Buffer` values', function() {
      const value = Buffer.from([0x12, 0x34, 0x00, 0x00]);
      const expected = Buffer.from('12340000', 'hex');
      const parameterValue = { value, length: 4 };

      const buffer = Buffer.concat([...TYPES.Binary.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);
      const parameterValue = { value, length: 4 };

      const buffer = Buffer.concat([...TYPES.Binary.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.Binary;
      const parameter = { length: 1 };

      const expected = Buffer.from([0xAD, 1, 0]);

      const result = type.generateTypeInfo(parameter);
      assert.deepEqual(result, expected);
    });
  });
});

describe('Bit', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.Bit.generateParameterLength({ value: null }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.Bit.generateParameterLength({ value: true }), Buffer.from([0x01]));
      assert.deepEqual(TYPES.Bit.generateParameterLength({ value: false }), Buffer.from([0x01]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts `number` values', function() {
      const value = 1;
      const expected = Buffer.from([0x01]);
      const parameterValue = { value };

      const buffer = Buffer.concat([...TYPES.Bit.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);
      const parameterValue = { value };

      const buffer = Buffer.concat([...TYPES.Bit.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `undefined` values', function() {
      const value = undefined;
      const expected = Buffer.from([]);
      const parameterValue = { value };

      const buffer = Buffer.concat([...TYPES.Bit.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const expected = Buffer.from([0x68, 1]);

      const result = TYPES.Bit.generateTypeInfo();
      assert.deepEqual(result, expected);
    });
  });
});

describe('Char', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.Char.generateParameterLength({ value: null }), Buffer.from([0xFF, 0xFF]));
      assert.deepEqual(TYPES.Char.generateParameterLength({ value: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]) }), Buffer.from([0x04, 0x00]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts `Buffer` values', function() {
      const value = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]);
      const parameterValue = { value };

      const buffer = Buffer.concat([...TYPES.Char.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, value);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);
      const parameterValue = { value };

      const buffer = Buffer.concat([...TYPES.Char.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const expected = Buffer.from([0xAF, 1, 0, 0x00, 0x00, 0x00, 0x00, 0x00]);

      const result = TYPES.Char.generateTypeInfo({ length: 1 });
      assert.deepEqual(result, expected);
    });
  });
});

describe('Date', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.Date.generateParameterLength({ value: null }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.Date.generateParameterLength({ value: new Date() }), Buffer.from([0x03]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts dates during daylight savings period', function() {
      for (const [value, expectedBuffer] of [
        [new Date(2015, 5, 18, 23, 59, 59), Buffer.from('163a0b', 'hex')],
        [new Date(2015, 5, 19, 0, 0, 0), Buffer.from('173a0b', 'hex')],
        [new Date(2015, 5, 19, 23, 59, 59), Buffer.from('173a0b', 'hex')],
        [new Date(2015, 5, 20, 0, 0, 0), Buffer.from('183a0b', 'hex')]
      ]) {
        const buffer = Buffer.concat([...TYPES.Date.generateParameterData({ value: value }, { useUTC: false })]);
        assert.deepEqual(buffer, expectedBuffer);
      }
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.Date;
      const expected = Buffer.from([0x28]);

      const result = type.generateTypeInfo();
      assert.deepEqual(result, expected);
    });
  });

  describe('.validate', function() {
    it('returns a TypeError for dates that are out of range', function() {
      assert.throws(() => {
        const testDate = new Date();
        testDate.setFullYear(0);
        TYPES.Date.validate(testDate);
      }, TypeError, 'Out of range.');

      assert.throws(() => {
        TYPES.Date.validate(new Date('Jan 1, 10000'));
      }, TypeError, 'Out of range.');
    });
  });
});

describe('DateTime', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.DateTime.generateParameterLength({ value: null }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.DateTime.generateParameterLength({ value: new Date() }), Buffer.from([0x08]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts dates during daylight savings period', function() {
      for (const testSet of [
        [new Date(2015, 5, 18, 23, 59, 59), 42171],
        [new Date(2015, 5, 19, 0, 0, 0), 42172],
        [new Date(2015, 5, 19, 23, 59, 59), 42172],
        [new Date(2015, 5, 20, 0, 0, 0), 42173]
      ]) {
        const parameter = { value: testSet[0] };
        const expectedNoOfDays = testSet[1];
        const buffer = Buffer.concat([...TYPES.DateTime.generateParameterData(parameter, { useUTC: false })]);
        assert.strictEqual(buffer.readInt32LE(0), expectedNoOfDays);
      }
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.DateTime;
      const expected = Buffer.from([0x6F, 8]);

      const result = type.generateTypeInfo();
      assert.deepEqual(result, expected);
    });
  });

  describe('.validate', function() {
    it('returns a TypeError for dates that are out of range', function() {
      assert.throws(() => {
        TYPES.DateTime.validate(new Date('Dec 1, 1752'));
      }, TypeError, 'Out of range.');

      assert.throws(() => {
        TYPES.DateTime.validate('Jan 1, 10000');
      }, TypeError, 'Out of range.');
    });
  });
});

describe('DateTime2', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.DateTime2.generateParameterLength({ value: null, scale: 0 }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.DateTime2.generateParameterLength({ value: null, scale: 1 }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.DateTime2.generateParameterLength({ value: null, scale: 2 }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.DateTime2.generateParameterLength({ value: null, scale: 3 }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.DateTime2.generateParameterLength({ value: null, scale: 4 }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.DateTime2.generateParameterLength({ value: null, scale: 5 }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.DateTime2.generateParameterLength({ value: null, scale: 6 }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.DateTime2.generateParameterLength({ value: null, scale: 7 }), Buffer.from([0x00]));

      assert.deepEqual(TYPES.DateTime2.generateParameterLength({ value: new Date(), scale: 0 }), Buffer.from([0x06]));
      assert.deepEqual(TYPES.DateTime2.generateParameterLength({ value: new Date(), scale: 1 }), Buffer.from([0x06]));
      assert.deepEqual(TYPES.DateTime2.generateParameterLength({ value: new Date(), scale: 2 }), Buffer.from([0x06]));
      assert.deepEqual(TYPES.DateTime2.generateParameterLength({ value: new Date(), scale: 3 }), Buffer.from([0x07]));
      assert.deepEqual(TYPES.DateTime2.generateParameterLength({ value: new Date(), scale: 4 }), Buffer.from([0x07]));
      assert.deepEqual(TYPES.DateTime2.generateParameterLength({ value: new Date(), scale: 5 }), Buffer.from([0x08]));
      assert.deepEqual(TYPES.DateTime2.generateParameterLength({ value: new Date(), scale: 6 }), Buffer.from([0x08]));
      assert.deepEqual(TYPES.DateTime2.generateParameterLength({ value: new Date(), scale: 7 }), Buffer.from([0x08]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts dates during daylight savings period', () => {
      for (const [value, expectedBuffer] of [
        [new Date(2015, 5, 18, 23, 59, 59), Buffer.from('7f5101163a0b', 'hex')],
        [new Date(2015, 5, 19, 0, 0, 0), Buffer.from('000000173a0b', 'hex')],
        [new Date(2015, 5, 19, 23, 59, 59), Buffer.from('7f5101173a0b', 'hex')],
        [new Date(2015, 5, 20, 0, 0, 0), Buffer.from('000000183a0b', 'hex')]
      ]) {
        const buffer = Buffer.concat([...TYPES.DateTime2.generateParameterData({ value: value, scale: 0 }, { useUTC: false })]);
        assert.deepEqual(buffer, expectedBuffer);
      }
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const expected = Buffer.from([0x2A, 1]);

      const buffer = TYPES.DateTime2.generateTypeInfo({ scale: 1 });
      assert.deepEqual(buffer, expected);
    });
  });
  describe('.validate', function() {
    it('returns a TypeError for dates that are out of range', function() {
      assert.throws(() => {
        const testDate = new Date();
        testDate.setFullYear(0);
        TYPES.DateTime2.validate(testDate);
      }, TypeError, 'Out of range.');

      assert.throws(() => {
        TYPES.DateTime2.validate(new Date('Jan 1, 10000'));
      }, TypeError, 'Out of range.');
    });
  });
});

describe('DateTimeOffset', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.DateTimeOffset.generateParameterLength({ value: null, scale: 0 }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.DateTimeOffset.generateParameterLength({ value: null, scale: 1 }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.DateTimeOffset.generateParameterLength({ value: null, scale: 2 }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.DateTimeOffset.generateParameterLength({ value: null, scale: 3 }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.DateTimeOffset.generateParameterLength({ value: null, scale: 4 }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.DateTimeOffset.generateParameterLength({ value: null, scale: 5 }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.DateTimeOffset.generateParameterLength({ value: null, scale: 6 }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.DateTimeOffset.generateParameterLength({ value: null, scale: 7 }), Buffer.from([0x00]));

      assert.deepEqual(TYPES.DateTimeOffset.generateParameterLength({ value: new Date(), scale: 0 }), Buffer.from([0x08]));
      assert.deepEqual(TYPES.DateTimeOffset.generateParameterLength({ value: new Date(), scale: 1 }), Buffer.from([0x08]));
      assert.deepEqual(TYPES.DateTimeOffset.generateParameterLength({ value: new Date(), scale: 2 }), Buffer.from([0x08]));
      assert.deepEqual(TYPES.DateTimeOffset.generateParameterLength({ value: new Date(), scale: 3 }), Buffer.from([0x09]));
      assert.deepEqual(TYPES.DateTimeOffset.generateParameterLength({ value: new Date(), scale: 4 }), Buffer.from([0x09]));
      assert.deepEqual(TYPES.DateTimeOffset.generateParameterLength({ value: new Date(), scale: 5 }), Buffer.from([0x0A]));
      assert.deepEqual(TYPES.DateTimeOffset.generateParameterLength({ value: new Date(), scale: 6 }), Buffer.from([0x0A]));
      assert.deepEqual(TYPES.DateTimeOffset.generateParameterLength({ value: new Date(), scale: 7 }), Buffer.from([0x0A]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts `Date` values', function() {
      const value = new Date(Date.UTC(2014, 1, 14, 17, 59, 59, 999));
      const expected = Buffer.from('20fd002d380b', 'hex');
      const parameterValue = { value, scale: 0 };

      const buffer = Buffer.concat([...TYPES.DateTimeOffset.generateParameterData(parameterValue, { useUTC: true })]);
      assert.deepEqual(buffer.slice(0, 6), expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const parameterValue = { value, scale: 0 };
      const buffer = Buffer.concat([...TYPES.DateTimeOffset.generateParameterData(parameterValue, { useUTC: true })]);
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const expected = Buffer.from([0x2B, 1]);

      const buffer = TYPES.DateTimeOffset.generateTypeInfo({ scale: 1 });
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.validate', function() {
    it('returns a TypeError for dates that are out of range', function() {
      assert.throws(() => {
        const testDate = new Date();
        testDate.setFullYear(0);
        TYPES.DateTimeOffset.validate(testDate);
      }, TypeError, 'Out of range.');

      assert.throws(() => {
        TYPES.DateTimeOffset.validate(new Date('Jan 1, 10000'));
      }, TypeError, 'Out of range.');
    });
  });
});

describe('Decimal', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      for (let i = 1; i <= 38; i++) {
        assert.deepEqual(TYPES.Decimal.generateParameterLength({ value: null, precision: i }), Buffer.from([0x00]));
      }

      for (let i = 1; i <= 9; i++) {
        assert.deepEqual(TYPES.Decimal.generateParameterLength({ value: 1.23, precision: i }), Buffer.from([0x05]));
      }

      for (let i = 10; i <= 19; i++) {
        assert.deepEqual(TYPES.Decimal.generateParameterLength({ value: 1.23, precision: i }), Buffer.from([0x09]));
      }

      for (let i = 20; i <= 28; i++) {
        assert.deepEqual(TYPES.Decimal.generateParameterLength({ value: 1.23, precision: i }), Buffer.from([0x0D]));
      }

      for (let i = 29; i <= 38; i++) {
        assert.deepEqual(TYPES.Decimal.generateParameterLength({ value: 1.23, precision: i }), Buffer.from([0x11]));
      }
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts `number` values (Precision <= 9)', function() {
      const value = 1.23;
      const expected = Buffer.from('0101000000', 'hex');
      const precision = 1;

      const type = TYPES.Decimal;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `number` values (Precision <= 19)', function() {
      const value = 1.23;
      const expected = Buffer.from('010100000000000000', 'hex');
      const precision = 15;

      const type = TYPES.Decimal;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `number` values (Precision <= 28)', function() {
      const value = 1.23;
      const expected = Buffer.from('01010000000000000000000000', 'hex');
      const precision = 25;

      const type = TYPES.Decimal;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `number` values (Precision > 28)', function() {
      const value = 1.23;
      const expected = Buffer.from('0101000000000000000000000000000000', 'hex');
      const precision = 30;

      const type = TYPES.Decimal;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.Decimal;

      // Precision <= 9
      const expected1 = Buffer.from([0x6A, 5, 1, 1]);
      const result = type.generateTypeInfo({ precision: 1, scale: 1 });
      assert.deepEqual(result, expected1);

      // Precision <= 19
      const expected2 = Buffer.from([0x6A, 9, 15, 1]);
      const result2 = type.generateTypeInfo({ precision: 15, scale: 1 });
      assert.deepEqual(result2, expected2);


      // Precision <= 28
      const expected3 = Buffer.from([0x6A, 13, 20, 1]);
      const result3 = type.generateTypeInfo({ precision: 20, scale: 1 });
      assert.deepEqual(result3, expected3);

      // Precision > 28
      const expected4 = Buffer.from([0x6A, 17, 30, 1]);
      const result4 = type.generateTypeInfo({ precision: 30, scale: 1 });
      assert.deepEqual(result4, expected4);
    });
  });

  describe('.validate', function() {
    it('returns a TypeError for decimals if the passed in value is unacceptable', function() {
      assert.throws(() => {
        TYPES.Decimal.validate('ABC');
      }, TypeError, 'Invalid number.');
      assert.throws(() => {
        TYPES.Decimal.validate('e123');
      }, TypeError, 'Invalid number.');
    });

    it('returns a the "Infinity" literal the decimals is outside the double-precision 64-bit IEEE 754-2019 format range', function() {
      assert.equal(TYPES.Decimal.validate(1.7976931348623159e+308), Infinity);
      assert.equal(TYPES.Decimal.validate(-1.7976931348623159e+308), -Infinity);
      assert.equal(TYPES.Decimal.validate('Infinity'), Infinity);
      assert.equal(TYPES.Decimal.validate('-Infinity'), -Infinity);
    });

    it('Corect pasing the decimals with special cases', function() {
      assert.equal(TYPES.Decimal.validate('123.3.3'), 123.3);
      assert.equal(TYPES.Decimal.validate('1-23'), 1);
      assert.equal(TYPES.Decimal.validate('1+23'), 1);
      assert.equal(TYPES.Decimal.validate('1e23e4'), 1e23);
      assert.equal(TYPES.Decimal.validate('   123'), 123);
      assert.equal(TYPES.Decimal.validate('1-e5'), 1);
      assert.equal(TYPES.Decimal.validate('1e2e3'), 100);
    });
  });
});

describe('Float', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.Float.generateParameterLength({ value: null }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.Float.generateParameterLength({ value: 1.2345 }), Buffer.from([0x08]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts `number` values', function() {
      const value = 1.2345;
      const expected = Buffer.from('8d976e1283c0f33f', 'hex');

      const type = TYPES.Float;
      const parameterValue = { value };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.Float;
      const parameterValue = { value };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.Float;
      const expected = Buffer.from([0x6D, 8]);

      const result = type.generateTypeInfo();
      assert.deepEqual(result, expected);
    });
  });

  describe('.validate', function() {
    it('returns a TypeError for decimals if the passed in value is unacceptable', function() {
      assert.throws(() => {
        TYPES.Float.validate('ABC');
      }, TypeError, 'Invalid number.');
      assert.throws(() => {
        TYPES.Float.validate('e123');
      }, TypeError, 'Invalid number.');
    });

    it('returns a the "Infinity" literal the decimals is outside the double-precision 64-bit IEEE 754-2019 format range', function() {
      assert.equal(TYPES.Float.validate(1.7976931348623159e+308), Infinity);
      assert.equal(TYPES.Float.validate(-1.7976931348623159e+308), -Infinity);
      assert.equal(TYPES.Float.validate('Infinity'), Infinity);
      assert.equal(TYPES.Float.validate('-Infinity'), -Infinity);
    });

    it('Corect pasing the decimals with special cases', function() {
      assert.equal(TYPES.Float.validate('123.3.3'), 123.3);
      assert.equal(TYPES.Float.validate('1-23'), 1);
      assert.equal(TYPES.Float.validate('1+23'), 1);
      assert.equal(TYPES.Float.validate('1e23e4'), 1e23);
      assert.equal(TYPES.Float.validate('   123'), 123);
      assert.equal(TYPES.Float.validate('1-e5'), 1);
      assert.equal(TYPES.Float.validate('1e2e3'), 100);
    });
  });
});

describe('Image', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.Image.generateParameterLength({ value: null, length: -1 }), Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]));
      assert.deepEqual(TYPES.Image.generateParameterLength({ value: Buffer.alloc(10), length: 10 }), Buffer.from([0x0A, 0x00, 0x00, 0x00]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts `Buffer` values', function() {
      const value = Buffer.from('010101', 'hex');

      const type = TYPES.Image;
      const parameterValue = { value, length: 100 };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, value);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.Image;
      const parameterValue = { value, length: -1 };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.Image;
      const expected = Buffer.from([0x22, 1, 0, 0, 0]);

      const result = type.generateTypeInfo({ length: 1 });
      assert.deepEqual(result, expected);
    });
  });
});

describe('Int', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.Int.generateParameterLength({ value: null }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.Int.generateParameterLength({ value: 123 }), Buffer.from([0x04]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts `number` values', function() {
      const value = 1234;
      const expected = Buffer.from('d2040000', 'hex');

      const type = TYPES.Int;
      const parameterValue = { value };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.Int;
      const parameterValue = { value };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.Int;
      const expected = Buffer.from([0x26, 4]);

      const result = type.generateTypeInfo();
      assert.deepEqual(result, expected);
    });
  });

  describe('.validate', function() {
    it('throws Invalid number error for NaN input', function() {
      assert.throws(() => {
        TYPES.Int.validate('string');
      }, TypeError, 'Invalid number.');
    });

    it('throws Out of Range error for numbers out of range', function() {
      assert.throws(() => {
        TYPES.Int.validate(-2147483648 - 1);
      }, TypeError, 'Value must be between -2147483648 and 2147483647, inclusive.');

      assert.throws(() => {
        TYPES.Int.validate(2147483647 + 1);
      }, TypeError, 'Value must be between -2147483648 and 2147483647, inclusive.');
    });
  });
});

describe('Money', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.Money.generateParameterLength({ value: null }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.Money.generateParameterLength({ value: 123 }), Buffer.from([0x08]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts `number` values', function() {
      const value = 1234;
      const expected = Buffer.from('00000000204bbc00', 'hex');

      const type = TYPES.Money;
      const parameterValue = { value };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.Money;
      const parameterValue = { value };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.Money;
      const expected = Buffer.from([0x6E, 8]);

      const result = type.generateTypeInfo();
      assert.deepEqual(result, expected);
    });
  });

  describe('.validate', function() {
    it('throws Invalid number error for NaN input', function() {
      assert.throws(() => {
        TYPES.TinyInt.validate('string');
      }, TypeError, 'Invalid number.');
    });

    it('throws Out of Range error for numbers out of range', function() {
      assert.throws(() => {

        TYPES.Money.validate(-922337203685477.5808 - 0.1);
      }, TypeError, 'Value must be between -922337203685477.5808 and 922337203685477.5807, inclusive.');

      assert.throws(() => {
        TYPES.Money.validate(922337203685477.5807 + 0.1);
      }, TypeError, 'Value must be between -922337203685477.5808 and 922337203685477.5807, inclusive.');
    });
  });
});

describe('NChar', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.NChar.generateParameterLength({ value: null }), Buffer.from([0xFF, 0xFF]));
      assert.deepEqual(TYPES.NChar.generateParameterLength({ value: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]) }), Buffer.from([0x04, 0x00]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts `Buffer` values', function() {
      const value = Buffer.from([0xff, 0xff, 0xff, 0xff]);

      const type = TYPES.NChar;
      const parameterValue = { value };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, value);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.NChar;
      const parameterValue = { value };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.NChar;
      const expected = Buffer.from([0xEF, 2, 0, 0x00, 0x00, 0x00, 0x00, 0x00]);

      const result = type.generateTypeInfo({ length: 1 });
      assert.deepEqual(result, expected);
    });
  });
});

describe('Numeric', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      for (let i = 1; i <= 38; i++) {
        assert.deepEqual(TYPES.Numeric.generateParameterLength({ value: null, precision: i }), Buffer.from([0x00]));
      }

      for (let i = 1; i <= 9; i++) {
        assert.deepEqual(TYPES.Numeric.generateParameterLength({ value: 1.23, precision: i }), Buffer.from([0x05]));
      }

      for (let i = 10; i <= 19; i++) {
        assert.deepEqual(TYPES.Numeric.generateParameterLength({ value: 1.23, precision: i }), Buffer.from([0x09]));
      }

      for (let i = 20; i <= 28; i++) {
        assert.deepEqual(TYPES.Numeric.generateParameterLength({ value: 1.23, precision: i }), Buffer.from([0x0D]));
      }

      for (let i = 29; i <= 38; i++) {
        assert.deepEqual(TYPES.Numeric.generateParameterLength({ value: 1.23, precision: i }), Buffer.from([0x11]));
      }
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts `number` values (Precision <= 9)', function() {
      const value = 1.23;
      const expected = Buffer.from('0101000000', 'hex');
      const precision = 1;

      const type = TYPES.Numeric;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `number` values (Precision <= 19)', function() {
      const value = 1.23;
      const expected = Buffer.from('010100000000000000', 'hex');
      const precision = 15;

      const type = TYPES.Numeric;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `number` values (Precision <= 28)', function() {
      const value = 1.23;
      const expected = Buffer.from('01010000000000000000000000', 'hex');
      const precision = 25;

      const type = TYPES.Numeric;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `number` values (Precision > 28)', function() {
      const value = 1.23;
      const expected = Buffer.from('0101000000000000000000000000000000', 'hex');
      const precision = 30;

      const type = TYPES.Numeric;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.Numeric;

      // Precision <= 9
      const expected1 = Buffer.from([0x6C, 5, 1, 1]);
      const result = type.generateTypeInfo({ precision: 1, scale: 1 });
      assert.deepEqual(result, expected1);

      // Precision <= 19
      const expected2 = Buffer.from([0x6C, 9, 15, 1]);
      const result2 = type.generateTypeInfo({ precision: 15, scale: 1 });
      assert.deepEqual(result2, expected2);

      // Precision <= 28
      const expected3 = Buffer.from([0x6C, 13, 20, 1]);
      const result3 = type.generateTypeInfo({ precision: 20, scale: 1 });
      assert.deepEqual(result3, expected3);

      // Precision > 28
      const expected4 = Buffer.from([0x6C, 17, 30, 1]);
      const result4 = type.generateTypeInfo({ precision: 30, scale: 1 });
      assert.deepEqual(result4, expected4);
    });
  });
});

describe('NVarChar', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.NVarChar.generateParameterLength({ value: null, length: 10 }), Buffer.from([0xFF, 0xFF]));
      assert.deepEqual(TYPES.NVarChar.generateParameterLength({ value: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), length: 10 }), Buffer.from([0x04, 0x00]));

      assert.deepEqual(TYPES.NVarChar.generateParameterLength({ value: null, length: 10000 }), Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
      assert.deepEqual(TYPES.NVarChar.generateParameterLength({ value: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), length: 10000 }), Buffer.from([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts `Buffer` values (Length <= Maximum Length)', function() {
      const value = Buffer.from([0xff, 0xff]);
      const expected = Buffer.from('ffff', 'hex');
      const length = 1;

      const type = TYPES.NVarChar;
      const parameterValue = { value, length };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `Buffer` values (Length > Maximum Length)', function() {
      const value = Buffer.from([0xff, 0xff]);
      const expected = Buffer.from('02000000ffff00000000', 'hex');
      const length = 4100;

      const type = TYPES.NVarChar;
      const parameterValue = { value, length };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values (Length <= Maximum Length)', function() {
      const value = null;
      const expected = Buffer.from([]);
      const length = 1;

      const type = TYPES.NVarChar;
      const parameterValue = { value, length };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values (Length > Maximum Length)', function() {
      const value = null;
      const expected = Buffer.from([]);
      const length = 5000;

      const type = TYPES.NVarChar;
      const parameterValue = { value, length };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
    // Length <= Maximum Length
      const type = TYPES.NVarChar;
      const expected = Buffer.from([0xE7, 2, 0, 0x00, 0x00, 0x00, 0x00, 0x00]);

      const result = type.generateTypeInfo({ length: 1 });
      assert.deepEqual(result, expected);

      // Length > Maximum Length
      const expected1 = Buffer.from([0xE7, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00]);

      const result2 = type.generateTypeInfo({ length: 4100 });
      assert.deepEqual(result2, expected1);
    });
  });
});

describe('Real', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.Real.generateParameterLength({ value: null }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.Real.generateParameterLength({ value: 123.123 }), Buffer.from([0x04]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts `number` values', function() {
      const value = 123.123;
      const expected = Buffer.from('fa3ef642', 'hex');

      const type = TYPES.Real;
      const parameterValue = { value };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.Real;
      const parameterValue = { value };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.Real;
      const expected = Buffer.from([0x6D, 4]);

      const result = type.generateTypeInfo();
      assert.deepEqual(result, expected);
    });
  });
});

describe('SmallDateTime', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.SmallDateTime.generateParameterLength({ value: null }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.SmallDateTime.generateParameterLength({ value: new Date() }), Buffer.from([0x04]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts dates during daylight savings period', function() {
      for (const [value, expectedNoOfDays] of [
        [new Date(2015, 5, 18, 23, 59, 59), 42171],
        [new Date(2015, 5, 19, 0, 0, 0), 42172],
        [new Date(2015, 5, 19, 23, 59, 59), 42172],
        [new Date(2015, 5, 20, 0, 0, 0), 42173]
      ]) {
        const buffer = Buffer.concat([...TYPES.SmallDateTime.generateParameterData({ value }, { useUTC: false })]);

        assert.strictEqual(buffer.readUInt16LE(0), expectedNoOfDays);
      }
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const expected = Buffer.from([0x6F, 0x04]);
      const result = TYPES.SmallDateTime.generateTypeInfo();

      assert.deepEqual(result, expected);
    });
  });

  describe('.validate', function() {
    it('returns a TypeError for dates that are out of range', function() {
      assert.throws(() => {
        TYPES.SmallDateTime.validate(new Date('Dec 31, 1889'));
      }, TypeError, 'Out of range.');

      assert.throws(() => {
        TYPES.SmallDateTime.validate(new Date('Jan 1, 2080'));
      }, TypeError, 'Out of range.');

      assert.throws(() => {
        TYPES.SmallDateTime.validate(new Date('June 7, 2079'));
      }, TypeError, 'Out of range.');
    });
  });
});

describe('SmallInt', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.SmallInt.generateParameterLength({ value: null }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.SmallInt.generateParameterLength({ value: 123 }), Buffer.from([0x02]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts `number` values', function() {
      const value = 2;
      const expected = Buffer.from('0200', 'hex');

      const type = TYPES.SmallInt;
      const parameterValue = { value };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.SmallInt;
      const parameterValue = { value };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.SmallInt;
      const expected = Buffer.from([0x26, 2]);

      const result = type.generateTypeInfo();
      assert.deepEqual(result, expected);
    });
  });

  describe('.validate', function() {
    it('throws Invalid number error for NaN input', function() {
      assert.throws(() => {
        TYPES.SmallInt.validate('string');
      }, TypeError, 'Invalid number.');
    });

    it('throws Out of Range error for numbers out of range', function() {
      assert.throws(() => {
        TYPES.SmallInt.validate(-32768 - 1);
      }, TypeError, 'Value must be between -32768 and 32767, inclusive.');

      assert.throws(() => {
        TYPES.SmallInt.validate(32767 + 1);
      }, TypeError, 'Value must be between -32768 and 32767, inclusive.');
    });
  });
});

describe('SmallMoney', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.SmallMoney.generateParameterLength({ value: null }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.SmallMoney.generateParameterLength({ value: 123 }), Buffer.from([0x04]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts `number` values', function() {
      const value = 2;
      const expected = Buffer.from('204e0000', 'hex');

      const type = TYPES.SmallMoney;
      const parameterValue = { value };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.SmallMoney;
      const parameterValue = { value };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    describe('.validate', function() {
      it('throws Invalid number error for NaN input', function() {
        assert.throws(() => {
          TYPES.SmallMoney.validate('string');
        }, TypeError, 'Invalid number.');
      });

      it('throws Out of Range error for numbers out of range', function() {
        assert.throws(() => {
          TYPES.SmallMoney.validate(-214748.3648 - 0.0001);
        }, TypeError, 'Value must be between -214748.3648 and 214748.3647.');

        assert.throws(() => {
          TYPES.SmallMoney.validate(214748.3647 + 0.0001);
        }, TypeError, 'Value must be between -214748.3648 and 214748.3647.');
      });
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.SmallMoney;
      const expected = Buffer.from([0x6E, 4]);

      const result = type.generateTypeInfo();
      assert.deepEqual(result, expected);
    });
  });
});

describe('Text', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.Text.generateParameterLength({ value: null, length: -1 }), Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]));
      assert.deepEqual(TYPES.Text.generateParameterLength({ value: Buffer.from('Hello World', 'ascii'), length: 11 }), Buffer.from([0x0B, 0x00, 0x00, 0x00]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts `Buffer` values', function() {
      const value = Buffer.from('Hello World', 'ascii');
      const expected = Buffer.from('48656c6c6f20576f726c64', 'hex');

      const type = TYPES.Text;
      const parameterValue = { value, length: 15 };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.Text;
      const parameterValue = { value, length: -1 };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.Text;
      const expected = Buffer.from([0x23, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

      const result = type.generateTypeInfo({ length: 1 });
      assert.deepEqual(result, expected);
    });
  });
});

describe('Time', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.Time.generateParameterLength({ value: null, scale: 0 }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.Time.generateParameterLength({ value: null, scale: 1 }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.Time.generateParameterLength({ value: null, scale: 2 }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.Time.generateParameterLength({ value: null, scale: 3 }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.Time.generateParameterLength({ value: null, scale: 4 }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.Time.generateParameterLength({ value: null, scale: 5 }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.Time.generateParameterLength({ value: null, scale: 6 }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.Time.generateParameterLength({ value: null, scale: 7 }), Buffer.from([0x00]));

      assert.deepEqual(TYPES.Time.generateParameterLength({ value: new Date(), scale: 0 }), Buffer.from([0x03]));
      assert.deepEqual(TYPES.Time.generateParameterLength({ value: new Date(), scale: 1 }), Buffer.from([0x03]));
      assert.deepEqual(TYPES.Time.generateParameterLength({ value: new Date(), scale: 2 }), Buffer.from([0x03]));
      assert.deepEqual(TYPES.Time.generateParameterLength({ value: new Date(), scale: 3 }), Buffer.from([0x04]));
      assert.deepEqual(TYPES.Time.generateParameterLength({ value: new Date(), scale: 4 }), Buffer.from([0x04]));
      assert.deepEqual(TYPES.Time.generateParameterLength({ value: new Date(), scale: 5 }), Buffer.from([0x05]));
      assert.deepEqual(TYPES.Time.generateParameterLength({ value: new Date(), scale: 6 }), Buffer.from([0x05]));
      assert.deepEqual(TYPES.Time.generateParameterLength({ value: new Date(), scale: 7 }), Buffer.from([0x05]));
    });
  });
  describe('.generateParameterData', function() {
    // Test rounding of nanosecondDelta
    it('correctly converts `Date` values with a `nanosecondDelta` property', () => {
      const type = TYPES.Time;
      for (const [value, nanosecondDelta, scale, expectedBuffer] of [
        [new Date(2017, 6, 29, 17, 20, 3, 503), 0.0006264, 7, Buffer.from('68fc624b91', 'hex')],
        [new Date(2017, 9, 1, 1, 31, 4, 12), 0.0004612, 7, Buffer.from('c422ceb80c', 'hex')],
        [new Date(2017, 7, 3, 12, 52, 28, 373), 0.0007118, 7, Buffer.from('1e94c8e96b', 'hex')]
      ]) {
        const parameter = { value: value, scale: scale };
        parameter.value.nanosecondDelta = nanosecondDelta;

        const buffer = Buffer.concat([...type.generateParameterData(parameter, { useUTC: false }, () => { })]);
        assert.deepEqual(buffer, expectedBuffer);
      }
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.Time;
      const expected = Buffer.from([0x29, 1]);

      const reuslt = type.generateTypeInfo({ scale: 1 });
      assert.deepEqual(reuslt, expected);
    });
  });
});

describe('TinyInt', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.TinyInt.generateParameterLength({ value: null }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.TinyInt.generateParameterLength({ value: 4 }), Buffer.from([0x01]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts `number` values', function() {
      const value = 1;
      const expected = Buffer.from('01', 'hex');

      const type = TYPES.TinyInt;
      const parameterValue = { value };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.TinyInt;
      const parameterValue = { value };

      const buffer = Buffer.concat([...type.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.TinyInt;
      const expected = Buffer.from([0x26, 1]);

      const result = type.generateTypeInfo();
      assert.deepEqual(result, expected);
    });
  });

  describe('.validate', function() {
    it('throws Invalid number error for NaN input', function() {
      assert.throws(() => {
        TYPES.TinyInt.validate('string');
      }, TypeError, 'Invalid number.');
    });

    it('throws Out of Range error for numbers out of range', function() {
      assert.throws(() => {
        TYPES.TinyInt.validate(-1);
      }, TypeError, 'Value must be between 0 and 255, inclusive.');

      assert.throws(() => {
        TYPES.TinyInt.validate(256);
      }, TypeError, 'Value must be between 0 and 255, inclusive.');
    });
  });
});

describe('TVP', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.TVP.generateParameterLength({ value: null }), Buffer.from([0xFF, 0xFF]));
      assert.deepEqual(
        TYPES.TVP.generateParameterLength({
          value: {
            columns: [{ name: 'user_id', type: TYPES.Int }],
            rows: [[ 15 ], [ 16 ]]
          }
        }),
        Buffer.from([0x01, 0x00])
      );
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts TVP table values', function() {
      const value = {
        columns: [{ name: 'user_id', type: TYPES.Int }],
        rows: [[ 15 ]]
      };
      const expected = Buffer.from('0000000000002604000001040f00000000', 'hex');
      const parameterValue = { value };

      const buffer = Buffer.concat([...TYPES.TVP.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;

      const expected = Buffer.from([0x00, 0x00]);
      const parameterValue = { value };

      const buffer = Buffer.concat([...TYPES.TVP.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const expected = Buffer.from([0xF3, 0x00, 0x00, 0x00]);

      const result = TYPES.TVP.generateTypeInfo({ value: null });
      assert.deepEqual(result, expected);
    });
  });
});

describe('UniqueIdentifier', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.UniqueIdentifier.generateParameterLength({ value: null }), Buffer.from([0x00]));
      assert.deepEqual(TYPES.UniqueIdentifier.generateParameterLength({ value: 'e062ae34-6de5-47f3-8ba3-29d25f77e71a' }), Buffer.from([0x10]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts `string` values', function() {
      const value = 'e062ae34-6de5-47f3-8ba3-29d25f77e71a';

      const expected = Buffer.from('34ae62e0e56df3478ba329d25f77e71a', 'hex');
      const parameterValue = { value };

      const buffer = Buffer.concat([...TYPES.UniqueIdentifier.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;

      const expected = Buffer.from([]);
      const parameterValue = { value };

      const buffer = Buffer.concat([...TYPES.UniqueIdentifier.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      const expected = Buffer.from([0x24, 0x10]);

      const result = TYPES.UniqueIdentifier.generateTypeInfo();
      assert.deepEqual(result, expected);
    });
  });

  describe('.validate', function() {
    it('returns the given value for values that match the UUID format', function() {
      const expected = 'e062ae34-6de5-47f3-8ba3-29d25f77e71a';
      const actual = TYPES.UniqueIdentifier.validate(expected);
      assert.strictEqual(actual, expected);
    });

    it("returns a TypeError for values that don't match the UUID format", function() {
      assert.throws(() => {
        TYPES.UniqueIdentifier.validate('invalid');
      }, TypeError, 'Invalid GUID.');
    });
  });
});

describe('VarBinary', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.VarBinary.generateParameterLength({ value: null, length: 10 }), Buffer.from([0xFF, 0xFF]));
      assert.deepEqual(TYPES.VarBinary.generateParameterLength({ value: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), length: 10 }), Buffer.from([0x04, 0x00]));

      assert.deepEqual(TYPES.VarBinary.generateParameterLength({ value: null, length: 10000 }), Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
      assert.deepEqual(TYPES.VarBinary.generateParameterLength({ value: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), length: 10000 }), Buffer.from([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts `null` values', () => {
      for (const [value, length, expected] of [
        [null, 1, Buffer.from([])],
        [null, 9000, Buffer.from([])]
      ]) {
        const parameterValue = { value, length };
        const buffer = Buffer.concat([...TYPES.VarBinary.generateParameterData(parameterValue, { useUTC: false }, () => { })]);
        assert.deepEqual(buffer, expected);
      }
    });

    it('correctly converts `number` values', () => {
      for (const [value, length, expected] of [
        [1, 1, Buffer.from('3100', 'hex')],
      ]) {
        const parameterValue = { value, length };
        const buffer = Buffer.concat([...TYPES.VarBinary.generateParameterData(parameterValue, { useUTC: false }, () => { })]);
        assert.deepEqual(buffer, expected);
      }
    });

    it('correctly converts `number` values (Length <= Maximum Length)', function() {
      const value = 1;
      const length = 1;
      const expected = Buffer.from('3100', 'hex');
      const parameterValue = { value, length };

      const buffer = Buffer.concat([...TYPES.VarBinary.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `number` values (Length > Maximum Length)', function() {
      const value = 1;
      const length = 9000;
      const expected = Buffer.from('02000000310000000000', 'hex');
      const parameterValue = { value, length };

      const buffer = Buffer.concat([...TYPES.VarBinary.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values (Length <= Maximum Length)', function() {
      const value = null;
      const length = 1;
      const expected = Buffer.from([]);
      const parameterValue = { value, length };

      const buffer = Buffer.concat([...TYPES.VarBinary.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values (Length > Maximum Length)', function() {
      const value = null;
      const length = 9000;
      const expected = Buffer.from([]);
      const parameterValue = { value, length };

      const buffer = Buffer.concat([...TYPES.VarBinary.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      // Length <= Maximum Length
      const expected = Buffer.from([0xA5, 0x01, 0x00]);

      const result = TYPES.VarBinary.generateTypeInfo({ length: 1 });
      assert.deepEqual(result, expected);

      // Length > Maximum Length
      const expected1 = Buffer.from([0xA5, 0xFF, 0xFF]);

      const result1 = TYPES.VarBinary.generateTypeInfo({ length: 8500 });
      assert.deepEqual(result1, expected1);
    });
  });
});

describe('VarChar', function() {
  describe('.generateParameterLength', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(TYPES.VarChar.generateParameterLength({ value: null, length: 10 }), Buffer.from([0xFF, 0xFF]));
      assert.deepEqual(TYPES.VarChar.generateParameterLength({ value: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), length: 10 }), Buffer.from([0x04, 0x00]));

      assert.deepEqual(TYPES.VarChar.generateParameterLength({ value: null, length: 10000 }), Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
      assert.deepEqual(TYPES.VarChar.generateParameterLength({ value: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), length: 10000 }), Buffer.from([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
    });
  });

  describe('.generateParameterData', function() {
    it('correctly converts `Buffer` values (Length <= Maximum Length)', function() {
      const value = Buffer.from('hello world');
      const length = 1;
      const expected = Buffer.from('68656c6c6f20776f726c64', 'hex');
      const parameterValue = { value, length };

      const buffer = Buffer.concat([...TYPES.VarChar.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `Buffer` values (Length > Maximum Length)', function() {
      const value = Buffer.from('hello world');
      const length = 9000;
      const expected = Buffer.from('0b00000068656c6c6f20776f726c6400000000', 'hex');
      const parameterValue = { value, length };

      const buffer = Buffer.concat([...TYPES.VarChar.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values (Length <= Maximum Length)', function() {
      const value = null;
      const length = 1;
      const expected = Buffer.from([]);
      const parameterValue = { value, length };

      const buffer = Buffer.concat([...TYPES.VarChar.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values (Length > Maximum Length)', function() {
      const value = null;
      const length = 9000;
      const expected = Buffer.from([]);
      const parameterValue = { value, length };

      const buffer = Buffer.concat([...TYPES.VarChar.generateParameterData(parameterValue, { useUTC: false })]);
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.generateTypeInfo', function() {
    it('returns the correct type information', function() {
      // Length <= Maximum Length
      const expected = Buffer.from('a7010000000000000', 'hex');

      const result = TYPES.VarChar.generateTypeInfo({ length: 1 });
      assert.deepEqual(result, expected);

      // Length > Maximum Length
      const expected1 = Buffer.from('a7ffff0000000000', 'hex');

      const result2 = TYPES.VarChar.generateTypeInfo({ length: 8500 });
      assert.deepEqual(result2, expected1);
    });
  });
});
