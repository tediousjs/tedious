import { typeByName as TYPES, type DataType, type ParameterData } from '../../src/data-type';
import { type InternalConnectionOptions } from '../../src/connection';
import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';

import { assert } from 'chai';

// Test options - using type assertion since tests only exercise code paths
// that use a subset of the full InternalConnectionOptions
const options: InternalConnectionOptions = {} as InternalConnectionOptions;
const optionsWithUTCFalse: InternalConnectionOptions = { useUTC: false } as InternalConnectionOptions;
const optionsWithUTCTrue: InternalConnectionOptions = { useUTC: true } as InternalConnectionOptions;

function typeInfo(type: DataType, parameter: ParameterData, options: InternalConnectionOptions) {
  const buffer = new WritableTrackingBuffer();
  type.writeTypeInfo(buffer, parameter, options);
  return buffer.data;
}

// What the compiled writer writes for a parameter, split into the length field and
// the data. A null is signalled in the length field, so writing a null gives
// the field's width.
function serialize(type: DataType, parameter: ParameterData, options: InternalConnectionOptions) {
  const write = type.compileWriter(parameter, options);
  const buffer = new WritableTrackingBuffer();
  assert.isUndefined(write(buffer, parameter.value));

  const nullBuffer = new WritableTrackingBuffer();
  write(nullBuffer, null);

  const bytes = buffer.data;
  return { length: bytes.subarray(0, nullBuffer.length), data: bytes.subarray(nullBuffer.length) };
}

describe('BigInt', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.BigInt, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.BigInt, { value: 123n }, options).length, Buffer.from([0x08]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts `number` values', function() {
      const value = 123456789;
      const expected = Buffer.from('15cd5b0700000000', 'hex');

      const parameterValue = { value: TYPES.BigInt.validate(value, undefined), length: 4 };
      const buffer = serialize(TYPES.BigInt, parameterValue, optionsWithUTCFalse).data;

      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `string` values', function() {
      const value = '123456789';
      const expected = Buffer.from('15cd5b0700000000', 'hex');

      const parameterValue = { value: TYPES.BigInt.validate(value, undefined), length: 4 };
      const buffer = serialize(TYPES.BigInt, parameterValue, optionsWithUTCFalse).data;

      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const parameterValue = { value, length: 4 };

      const buffer = serialize(TYPES.BigInt, parameterValue, optionsWithUTCFalse).data;

      assert.deepEqual(buffer, expected);
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const expected = Buffer.from([0x26, 8]);

      const result = typeInfo(TYPES.BigInt, { value: null }, options);
      assert.deepEqual(result, expected);
    });
  });
});

describe('Binary', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.Binary, { value: null, length: 10 }, options).length, Buffer.from([0xFF, 0xFF]));
      assert.deepEqual(serialize(TYPES.Binary, { value: Buffer.alloc(0), length: 0 }, options).length, Buffer.from([0x00, 0x00]));
      assert.deepEqual(serialize(TYPES.Binary, { value: Buffer.alloc(100), length: 100 }, options).length, Buffer.from([0x64, 0x00]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts `Buffer` values', function() {
      const value = Buffer.from([0x12, 0x34, 0x00, 0x00]);
      const expected = Buffer.from('12340000', 'hex');
      const parameterValue = { value, length: 4 };

      const buffer = serialize(TYPES.Binary, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);
      const parameterValue = { value, length: 4 };

      const buffer = serialize(TYPES.Binary, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.Binary;
      const parameter = { value: null, length: 1 };

      const expected = Buffer.from([0xAD, 1, 0]);

      const result = typeInfo(type, parameter, options);
      assert.deepEqual(result, expected);
    });
  });
});

describe('Bit', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.Bit, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.Bit, { value: true }, options).length, Buffer.from([0x01]));
      assert.deepEqual(serialize(TYPES.Bit, { value: false }, options).length, Buffer.from([0x01]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts `number` values', function() {
      const value = 1;
      const expected = Buffer.from([0x01]);
      const parameterValue = { value };

      const buffer = serialize(TYPES.Bit, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);
      const parameterValue = { value };

      const buffer = serialize(TYPES.Bit, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `undefined` values', function() {
      const value = undefined;
      const expected = Buffer.from([]);
      const parameterValue = { value };

      const buffer = serialize(TYPES.Bit, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const expected = Buffer.from([0x68, 1]);

      const result = typeInfo(TYPES.Bit, { value: null }, options);
      assert.deepEqual(result, expected);
    });
  });
});

describe('Char', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.Char, { value: null }, options).length, Buffer.from([0xFF, 0xFF]));
      assert.deepEqual(serialize(TYPES.Char, { value: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]) }, options).length, Buffer.from([0x04, 0x00]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts `Buffer` values', function() {
      const value = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]);
      const parameterValue = { value };

      const buffer = serialize(TYPES.Char, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, value);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);
      const parameterValue = { value };

      const buffer = serialize(TYPES.Char, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const expected = Buffer.from([0xAF, 1, 0, 0x00, 0x00, 0x00, 0x00, 0x00]);

      const result = typeInfo(TYPES.Char, { value: null, length: 1 }, options);
      assert.deepEqual(result, expected);
    });
  });
});

describe('Date', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.Date, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.Date, { value: new Date() }, options).length, Buffer.from([0x03]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts dates during daylight savings period', function() {
      for (const [value, expectedBuffer] of [
        [new Date(2015, 5, 18, 23, 59, 59), Buffer.from('163a0b', 'hex')],
        [new Date(2015, 5, 19, 0, 0, 0), Buffer.from('173a0b', 'hex')],
        [new Date(2015, 5, 19, 23, 59, 59), Buffer.from('173a0b', 'hex')],
        [new Date(2015, 5, 20, 0, 0, 0), Buffer.from('183a0b', 'hex')]
      ] as [Date, Buffer][]) {
        const buffer = serialize(TYPES.Date, { value: value }, optionsWithUTCFalse).data;
        assert.deepEqual(buffer, expectedBuffer);
      }
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.Date;
      const expected = Buffer.from([0x28]);

      const result = typeInfo(type, { value: null }, options);
      assert.deepEqual(result, expected);
    });
  });

  describe('.validate', function() {
    it('returns a TypeError for dates that are out of range', function() {
      assert.throws(() => {
        const testDate = new Date();
        testDate.setFullYear(0);
        TYPES.Date.validate(testDate, undefined);
      }, TypeError, 'Out of range.');

      assert.throws(() => {
        TYPES.Date.validate(new Date('Jan 1, 10000'), undefined);
      }, TypeError, 'Out of range.');
    });
  });
});

describe('DateTime', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.DateTime, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.DateTime, { value: new Date() }, options).length, Buffer.from([0x08]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts dates during daylight savings period', function() {
      for (const testSet of [
        [new Date(2015, 5, 18, 23, 59, 59), 42171],
        [new Date(2015, 5, 19, 0, 0, 0), 42172],
        [new Date(2015, 5, 19, 23, 59, 59), 42172],
        [new Date(2015, 5, 20, 0, 0, 0), 42173]
      ]) {
        const parameter = { value: testSet[0] };
        const expectedNoOfDays = testSet[1];
        const buffer = serialize(TYPES.DateTime, parameter, optionsWithUTCFalse).data;
        assert.strictEqual(buffer.readInt32LE(0), expectedNoOfDays);
      }
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.DateTime;
      const expected = Buffer.from([0x6F, 8]);

      const result = typeInfo(type, { value: null }, options);
      assert.deepEqual(result, expected);
    });
  });

  describe('.validate', function() {
    it('returns a TypeError for dates that are out of range', function() {
      assert.throws(() => {
        TYPES.DateTime.validate(new Date('Dec 1, 1752'), undefined);
      }, TypeError, 'Out of range.');

      assert.throws(() => {
        TYPES.DateTime.validate('Jan 1, 10000', undefined);
      }, TypeError, 'Out of range.');
    });
  });
});

describe('DateTime2', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.DateTime2, { value: null, scale: 0 }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.DateTime2, { value: null, scale: 1 }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.DateTime2, { value: null, scale: 2 }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.DateTime2, { value: null, scale: 3 }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.DateTime2, { value: null, scale: 4 }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.DateTime2, { value: null, scale: 5 }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.DateTime2, { value: null, scale: 6 }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.DateTime2, { value: null, scale: 7 }, options).length, Buffer.from([0x00]));

      assert.deepEqual(serialize(TYPES.DateTime2, { value: new Date(), scale: 0 }, options).length, Buffer.from([0x06]));
      assert.deepEqual(serialize(TYPES.DateTime2, { value: new Date(), scale: 1 }, options).length, Buffer.from([0x06]));
      assert.deepEqual(serialize(TYPES.DateTime2, { value: new Date(), scale: 2 }, options).length, Buffer.from([0x06]));
      assert.deepEqual(serialize(TYPES.DateTime2, { value: new Date(), scale: 3 }, options).length, Buffer.from([0x07]));
      assert.deepEqual(serialize(TYPES.DateTime2, { value: new Date(), scale: 4 }, options).length, Buffer.from([0x07]));
      assert.deepEqual(serialize(TYPES.DateTime2, { value: new Date(), scale: 5 }, options).length, Buffer.from([0x08]));
      assert.deepEqual(serialize(TYPES.DateTime2, { value: new Date(), scale: 6 }, options).length, Buffer.from([0x08]));
      assert.deepEqual(serialize(TYPES.DateTime2, { value: new Date(), scale: 7 }, options).length, Buffer.from([0x08]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts dates during daylight savings period', function() {
      for (const [value, expectedBuffer] of [
        [new Date(2015, 5, 18, 23, 59, 59), Buffer.from('7f5101163a0b', 'hex')],
        [new Date(2015, 5, 19, 0, 0, 0), Buffer.from('000000173a0b', 'hex')],
        [new Date(2015, 5, 19, 23, 59, 59), Buffer.from('7f5101173a0b', 'hex')],
        [new Date(2015, 5, 20, 0, 0, 0), Buffer.from('000000183a0b', 'hex')]
      ] as [Date, Buffer][]) {
        const buffer = serialize(TYPES.DateTime2, { value: value, scale: 0 }, optionsWithUTCFalse).data;
        assert.deepEqual(buffer, expectedBuffer);
      }
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const expected = Buffer.from([0x2A, 1]);

      const buffer = typeInfo(TYPES.DateTime2, { value: null, scale: 1 }, options);
      assert.deepEqual(buffer, expected);
    });
  });
  describe('.validate', function() {
    it('returns a TypeError for dates that are out of range', function() {
      assert.throws(() => {
        const testDate = new Date();
        testDate.setFullYear(0);
        TYPES.DateTime2.validate(testDate, undefined);
      }, TypeError, 'Out of range.');

      assert.throws(() => {
        TYPES.DateTime2.validate(new Date('Jan 1, 10000'), undefined);
      }, TypeError, 'Out of range.');
    });
  });
});

describe('DateTimeOffset', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.DateTimeOffset, { value: null, scale: 0 }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.DateTimeOffset, { value: null, scale: 1 }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.DateTimeOffset, { value: null, scale: 2 }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.DateTimeOffset, { value: null, scale: 3 }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.DateTimeOffset, { value: null, scale: 4 }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.DateTimeOffset, { value: null, scale: 5 }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.DateTimeOffset, { value: null, scale: 6 }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.DateTimeOffset, { value: null, scale: 7 }, options).length, Buffer.from([0x00]));

      assert.deepEqual(serialize(TYPES.DateTimeOffset, { value: new Date(), scale: 0 }, options).length, Buffer.from([0x08]));
      assert.deepEqual(serialize(TYPES.DateTimeOffset, { value: new Date(), scale: 1 }, options).length, Buffer.from([0x08]));
      assert.deepEqual(serialize(TYPES.DateTimeOffset, { value: new Date(), scale: 2 }, options).length, Buffer.from([0x08]));
      assert.deepEqual(serialize(TYPES.DateTimeOffset, { value: new Date(), scale: 3 }, options).length, Buffer.from([0x09]));
      assert.deepEqual(serialize(TYPES.DateTimeOffset, { value: new Date(), scale: 4 }, options).length, Buffer.from([0x09]));
      assert.deepEqual(serialize(TYPES.DateTimeOffset, { value: new Date(), scale: 5 }, options).length, Buffer.from([0x0A]));
      assert.deepEqual(serialize(TYPES.DateTimeOffset, { value: new Date(), scale: 6 }, options).length, Buffer.from([0x0A]));
      assert.deepEqual(serialize(TYPES.DateTimeOffset, { value: new Date(), scale: 7 }, options).length, Buffer.from([0x0A]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts `Date` values', function() {
      const value = new Date(Date.UTC(2014, 1, 14, 17, 59, 59, 999));
      const expected = Buffer.from('20fd002d380b', 'hex');
      const parameterValue = { value, scale: 0 };

      const buffer = serialize(TYPES.DateTimeOffset, parameterValue, optionsWithUTCTrue).data;
      assert.deepEqual(buffer.slice(0, 6), expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const parameterValue = { value, scale: 0 };
      const buffer = serialize(TYPES.DateTimeOffset, parameterValue, optionsWithUTCTrue).data;
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const expected = Buffer.from([0x2B, 1]);

      const buffer = typeInfo(TYPES.DateTimeOffset, { value: null, scale: 1 }, options);
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.validate', function() {
    it('returns a TypeError for dates that are out of range', function() {
      assert.throws(() => {
        const testDate = new Date();
        testDate.setFullYear(0);
        TYPES.DateTimeOffset.validate(testDate, undefined);
      }, TypeError, 'Out of range.');

      assert.throws(() => {
        TYPES.DateTimeOffset.validate(new Date('Jan 1, 10000'), undefined);
      }, TypeError, 'Out of range.');
    });
  });
});

describe('Decimal', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      for (let i = 1; i <= 38; i++) {
        assert.deepEqual(serialize(TYPES.Decimal, { value: null, precision: i }, options).length, Buffer.from([0x00]));
      }

      for (let i = 1; i <= 9; i++) {
        assert.deepEqual(serialize(TYPES.Decimal, { value: 1.23, precision: i, scale: 2 }, options).length, Buffer.from([0x05]));
      }

      for (let i = 10; i <= 19; i++) {
        assert.deepEqual(serialize(TYPES.Decimal, { value: 1.23, precision: i, scale: 2 }, options).length, Buffer.from([0x09]));
      }

      for (let i = 20; i <= 28; i++) {
        assert.deepEqual(serialize(TYPES.Decimal, { value: 1.23, precision: i, scale: 2 }, options).length, Buffer.from([0x0D]));
      }

      for (let i = 29; i <= 38; i++) {
        assert.deepEqual(serialize(TYPES.Decimal, { value: 1.23, precision: i, scale: 2 }, options).length, Buffer.from([0x11]));
      }
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts `number` values (Precision <= 9)', function() {
      const value = 1.23;
      const expected = Buffer.from('0101000000', 'hex');
      const precision = 1;

      const type = TYPES.Decimal;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `number` values (Precision <= 19)', function() {
      const value = 1.23;
      const expected = Buffer.from('010100000000000000', 'hex');
      const precision = 15;

      const type = TYPES.Decimal;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `number` values (Precision <= 28)', function() {
      const value = 1.23;
      const expected = Buffer.from('01010000000000000000000000', 'hex');
      const precision = 25;

      const type = TYPES.Decimal;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `number` values (Precision > 28)', function() {
      const value = 1.23;
      const expected = Buffer.from('0101000000000000000000000000000000', 'hex');
      const precision = 30;

      const type = TYPES.Decimal;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('serializes a scaled magnitude greater than 2^64 without throwing (#1733)', function() {
      // 2^64 (= 18446744073709551616) is the smallest value that overflowed the
      // previous 64-bit write path and threw an uncatchable RangeError.
      const value = 2 ** 64;
      const expected = Buffer.from('0100000000000000000100000000000000', 'hex');
      const precision = 38;

      const type = TYPES.Decimal;
      const parameterValue = { value, precision, scale: 0 };

      let buffer!: Buffer;
      assert.doesNotThrow(() => {
        buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      });
      assert.deepEqual(buffer, expected);
    });

    it('throws a RangeError when the scaled value overflows the field width', function() {
      const parameterValue = { value: -3.4028234663852886e+38, precision: 7, scale: 4 };

      assert.throws(() => {
        serialize(TYPES.Decimal, parameterValue, optionsWithUTCFalse).data;
      }, RangeError, 'Value -3.4028234663852886e+38 is out of range for DECIMAL(7, 4).');
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.Decimal;

      // Precision <= 9
      const expected1 = Buffer.from([0x6A, 5, 1, 1]);
      const result = typeInfo(type, { value: null, precision: 1, scale: 1 }, options);
      assert.deepEqual(result, expected1);

      // Precision <= 19
      const expected2 = Buffer.from([0x6A, 9, 15, 1]);
      const result2 = typeInfo(type, { value: null, precision: 15, scale: 1 }, options);
      assert.deepEqual(result2, expected2);


      // Precision <= 28
      const expected3 = Buffer.from([0x6A, 13, 20, 1]);
      const result3 = typeInfo(type, { value: null, precision: 20, scale: 1 }, options);
      assert.deepEqual(result3, expected3);

      // Precision > 28
      const expected4 = Buffer.from([0x6A, 17, 30, 1]);
      const result4 = typeInfo(type, { value: null, precision: 30, scale: 1 }, options);
      assert.deepEqual(result4, expected4);
    });
  });

  describe('.validate', function() {
    it('returns a TypeError for decimals if the passed in value is unacceptable', function() {
      assert.throws(() => {
        TYPES.Decimal.validate('ABC', undefined);
      }, TypeError, 'Invalid number.');
      assert.throws(() => {
        TYPES.Decimal.validate('e123', undefined);
      }, TypeError, 'Invalid number.');
    });

    it('returns a the "Infinity" literal the decimals is outside the double-precision 64-bit IEEE 754-2019 format range', function() {
      assert.equal(TYPES.Decimal.validate(1.7976931348623159e+308, undefined), Infinity);
      assert.equal(TYPES.Decimal.validate(-1.7976931348623159e+308, undefined), -Infinity);
      assert.equal(TYPES.Decimal.validate('Infinity', undefined), Infinity);
      assert.equal(TYPES.Decimal.validate('-Infinity', undefined), -Infinity);
    });

    it('Corect pasing the decimals with special cases', function() {
      assert.equal(TYPES.Decimal.validate('123.3.3', undefined), 123.3);
      assert.equal(TYPES.Decimal.validate('1-23', undefined), 1);
      assert.equal(TYPES.Decimal.validate('1+23', undefined), 1);
      assert.equal(TYPES.Decimal.validate('1e23e4', undefined), 1e23);
      assert.equal(TYPES.Decimal.validate('   123', undefined), 123);
      assert.equal(TYPES.Decimal.validate('1-e5', undefined), 1);
      assert.equal(TYPES.Decimal.validate('1e2e3', undefined), 100);
    });
  });
});

describe('Float', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.Float, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.Float, { value: 1.2345 }, options).length, Buffer.from([0x08]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts `number` values', function() {
      const value = 1.2345;
      const expected = Buffer.from('8d976e1283c0f33f', 'hex');

      const type = TYPES.Float;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.Float;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.Float;
      const expected = Buffer.from([0x6D, 8]);

      const result = typeInfo(type, { value: null }, options);
      assert.deepEqual(result, expected);
    });
  });

  describe('.validate', function() {
    it('returns a TypeError for decimals if the passed in value is unacceptable', function() {
      assert.throws(() => {
        TYPES.Float.validate('ABC', undefined);
      }, TypeError, 'Invalid number.');
      assert.throws(() => {
        TYPES.Float.validate('e123', undefined);
      }, TypeError, 'Invalid number.');
    });

    it('returns a the "Infinity" literal the decimals is outside the double-precision 64-bit IEEE 754-2019 format range', function() {
      assert.equal(TYPES.Float.validate(1.7976931348623159e+308, undefined), Infinity);
      assert.equal(TYPES.Float.validate(-1.7976931348623159e+308, undefined), -Infinity);
      assert.equal(TYPES.Float.validate('Infinity', undefined), Infinity);
      assert.equal(TYPES.Float.validate('-Infinity', undefined), -Infinity);
    });

    it('Corect pasing the decimals with special cases', function() {
      assert.equal(TYPES.Float.validate('123.3.3', undefined), 123.3);
      assert.equal(TYPES.Float.validate('1-23', undefined), 1);
      assert.equal(TYPES.Float.validate('1+23', undefined), 1);
      assert.equal(TYPES.Float.validate('1e23e4', undefined), 1e23);
      assert.equal(TYPES.Float.validate('   123', undefined), 123);
      assert.equal(TYPES.Float.validate('1-e5', undefined), 1);
      assert.equal(TYPES.Float.validate('1e2e3', undefined), 100);
    });
  });
});

describe('Image', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.Image, { value: null, length: -1 }, options).length, Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]));
      assert.deepEqual(serialize(TYPES.Image, { value: Buffer.alloc(10), length: 10 }, options).length, Buffer.from([0x0A, 0x00, 0x00, 0x00]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts `Buffer` values', function() {
      const value = Buffer.from('010101', 'hex');

      const type = TYPES.Image;
      const parameterValue = { value, length: 100 };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, value);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.Image;
      const parameterValue = { value, length: -1 };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.Image;
      const expected = Buffer.from([0x22, 1, 0, 0, 0]);

      const result = typeInfo(type, { value: null, length: 1 }, options);
      assert.deepEqual(result, expected);
    });
  });
});

describe('Int', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.Int, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.Int, { value: 123 }, options).length, Buffer.from([0x04]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts `number` values', function() {
      const value = 1234;
      const expected = Buffer.from('d2040000', 'hex');

      const type = TYPES.Int;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.Int;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.Int;
      const expected = Buffer.from([0x26, 4]);

      const result = typeInfo(type, { value: null }, options);
      assert.deepEqual(result, expected);
    });
  });

  describe('.validate', function() {
    it('throws Invalid number error for NaN input', function() {
      assert.throws(() => {
        TYPES.Int.validate('string', undefined);
      }, TypeError, 'Invalid number.');
    });

    it('throws Out of Range error for numbers out of range', function() {
      assert.throws(() => {
        TYPES.Int.validate(-2147483648 - 1, undefined);
      }, TypeError, 'Value must be between -2147483648 and 2147483647, inclusive.');

      assert.throws(() => {
        TYPES.Int.validate(2147483647 + 1, undefined);
      }, TypeError, 'Value must be between -2147483648 and 2147483647, inclusive.');
    });
  });
});

describe('Money', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.Money, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.Money, { value: 123 }, options).length, Buffer.from([0x08]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts `number` values', function() {
      const value = 1234;
      const expected = Buffer.from('00000000204bbc00', 'hex');

      const type = TYPES.Money;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.Money;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.Money;
      const expected = Buffer.from([0x6E, 8]);

      const result = typeInfo(type, { value: null }, options);
      assert.deepEqual(result, expected);
    });
  });

  describe('.validate', function() {
    it('throws Invalid number error for NaN input', function() {
      assert.throws(() => {
        TYPES.TinyInt.validate('string', undefined);
      }, TypeError, 'Invalid number.');
    });

    it('throws Out of Range error for numbers out of range', function() {
      assert.throws(() => {

        TYPES.Money.validate(-922337203685477.5808 - 0.1, undefined);
      }, TypeError, 'Value must be between -922337203685477.5808 and 922337203685477.5807, inclusive.');

      assert.throws(() => {
        TYPES.Money.validate(922337203685477.5807 + 0.1, undefined);
      }, TypeError, 'Value must be between -922337203685477.5808 and 922337203685477.5807, inclusive.');
    });
  });
});

describe('NChar', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.NChar, { value: null }, options).length, Buffer.from([0xFF, 0xFF]));
      assert.deepEqual(serialize(TYPES.NChar, { value: '\uffff\uffff' }, options).length, Buffer.from([0x04, 0x00]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts `string` values', function() {
      const value = '\uffff\uffff';
      const expected = Buffer.from([0xff, 0xff, 0xff, 0xff]);

      const type = TYPES.NChar;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.NChar;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.NChar;
      const expected = Buffer.from([0xEF, 2, 0, 0x00, 0x00, 0x00, 0x00, 0x00]);

      const result = typeInfo(type, { value: null, length: 1 }, options);
      assert.deepEqual(result, expected);
    });
  });
});

describe('Numeric', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      for (let i = 1; i <= 38; i++) {
        assert.deepEqual(serialize(TYPES.Numeric, { value: null, precision: i }, options).length, Buffer.from([0x00]));
      }

      for (let i = 1; i <= 9; i++) {
        assert.deepEqual(serialize(TYPES.Numeric, { value: 1.23, precision: i, scale: 2 }, options).length, Buffer.from([0x05]));
      }

      for (let i = 10; i <= 19; i++) {
        assert.deepEqual(serialize(TYPES.Numeric, { value: 1.23, precision: i, scale: 2 }, options).length, Buffer.from([0x09]));
      }

      for (let i = 20; i <= 28; i++) {
        assert.deepEqual(serialize(TYPES.Numeric, { value: 1.23, precision: i, scale: 2 }, options).length, Buffer.from([0x0D]));
      }

      for (let i = 29; i <= 38; i++) {
        assert.deepEqual(serialize(TYPES.Numeric, { value: 1.23, precision: i, scale: 2 }, options).length, Buffer.from([0x11]));
      }
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts `number` values (Precision <= 9)', function() {
      const value = 1.23;
      const expected = Buffer.from('0101000000', 'hex');
      const precision = 1;

      const type = TYPES.Numeric;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `number` values (Precision <= 19)', function() {
      const value = 1.23;
      const expected = Buffer.from('010100000000000000', 'hex');
      const precision = 15;

      const type = TYPES.Numeric;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `number` values (Precision <= 28)', function() {
      const value = 1.23;
      const expected = Buffer.from('01010000000000000000000000', 'hex');
      const precision = 25;

      const type = TYPES.Numeric;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `number` values (Precision > 28)', function() {
      const value = 1.23;
      const expected = Buffer.from('0101000000000000000000000000000000', 'hex');
      const precision = 30;

      const type = TYPES.Numeric;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('serializes a scaled magnitude greater than 2^64 without throwing (#1733)', function() {
      // 2^64 (= 18446744073709551616) is the smallest value that overflowed the
      // previous 64-bit write path and threw an uncatchable RangeError.
      const value = 2 ** 64;
      const expected = Buffer.from('0100000000000000000100000000000000', 'hex');
      const precision = 38;

      const type = TYPES.Numeric;
      const parameterValue = { value, precision, scale: 0 };

      let buffer!: Buffer;
      assert.doesNotThrow(() => {
        buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      });
      assert.deepEqual(buffer, expected);
    });

    it('throws a RangeError when the scaled value overflows the field width', function() {
      const parameterValue = { value: -3.4028234663852886e+38, precision: 7, scale: 4 };

      assert.throws(() => {
        serialize(TYPES.Numeric, parameterValue, optionsWithUTCFalse).data;
      }, RangeError, 'Value -3.4028234663852886e+38 is out of range for NUMERIC(7, 4).');
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.Numeric;

      // Precision <= 9
      const expected1 = Buffer.from([0x6C, 5, 1, 1]);
      const result = typeInfo(type, { value: null, precision: 1, scale: 1 }, options);
      assert.deepEqual(result, expected1);

      // Precision <= 19
      const expected2 = Buffer.from([0x6C, 9, 15, 1]);
      const result2 = typeInfo(type, { value: null, precision: 15, scale: 1 }, options);
      assert.deepEqual(result2, expected2);

      // Precision <= 28
      const expected3 = Buffer.from([0x6C, 13, 20, 1]);
      const result3 = typeInfo(type, { value: null, precision: 20, scale: 1 }, options);
      assert.deepEqual(result3, expected3);

      // Precision > 28
      const expected4 = Buffer.from([0x6C, 17, 30, 1]);
      const result4 = typeInfo(type, { value: null, precision: 30, scale: 1 }, options);
      assert.deepEqual(result4, expected4);
    });
  });
});

describe('NVarChar', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.NVarChar, { value: null, length: 10 }, options).length, Buffer.from([0xFF, 0xFF]));
      assert.deepEqual(serialize(TYPES.NVarChar, { value: '\uffff\uffff', length: 10 }, options).length, Buffer.from([0x04, 0x00]));

      assert.deepEqual(serialize(TYPES.NVarChar, { value: null, length: 10000 }, options).length, Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
      assert.deepEqual(serialize(TYPES.NVarChar, { value: '\uffff\uffff', length: 10000 }, options).length, Buffer.from([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts `string` values (Length <= Maximum Length)', function() {
      const value = '\uffff';
      const expected = Buffer.from('ffff', 'hex');
      const length = 1;

      const type = TYPES.NVarChar;
      const parameterValue = { value, length };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `string` values (Length > Maximum Length)', function() {
      const value = '\uffff';
      const expected = Buffer.from('02000000ffff00000000', 'hex');
      const length = 4100;

      const type = TYPES.NVarChar;
      const parameterValue = { value, length };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values (Length <= Maximum Length)', function() {
      const value = null;
      const expected = Buffer.from([]);
      const length = 1;

      const type = TYPES.NVarChar;
      const parameterValue = { value, length };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values (Length > Maximum Length)', function() {
      const value = null;
      const expected = Buffer.from([]);
      const length = 5000;

      const type = TYPES.NVarChar;
      const parameterValue = { value, length };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
    // Length <= Maximum Length
      const type = TYPES.NVarChar;
      const expected = Buffer.from([0xE7, 2, 0, 0x00, 0x00, 0x00, 0x00, 0x00]);

      const result = typeInfo(type, { value: null, length: 1 }, options);
      assert.deepEqual(result, expected);

      // Length > Maximum Length
      const expected1 = Buffer.from([0xE7, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00]);

      const result2 = typeInfo(type, { value: null, length: 4100 }, options);
      assert.deepEqual(result2, expected1);
    });
  });
});

describe('Real', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.Real, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.Real, { value: 123.123 }, options).length, Buffer.from([0x04]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts `number` values', function() {
      const value = 123.123;
      const expected = Buffer.from('fa3ef642', 'hex');

      const type = TYPES.Real;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.Real;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.Real;
      const expected = Buffer.from([0x6D, 4]);

      const result = typeInfo(type, { value: null }, options);
      assert.deepEqual(result, expected);
    });
  });
});

describe('SmallDateTime', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.SmallDateTime, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.SmallDateTime, { value: new Date() }, options).length, Buffer.from([0x04]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts dates during daylight savings period', function() {
      for (const [value, expectedNoOfDays] of [
        [new Date(2015, 5, 18, 23, 59, 59), 42171],
        [new Date(2015, 5, 19, 0, 0, 0), 42172],
        [new Date(2015, 5, 19, 23, 59, 59), 42172],
        [new Date(2015, 5, 20, 0, 0, 0), 42173]
      ]) {
        const buffer = serialize(TYPES.SmallDateTime, { value }, optionsWithUTCFalse).data;

        assert.strictEqual(buffer.readUInt16LE(0), expectedNoOfDays);
      }
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const expected = Buffer.from([0x6F, 0x04]);
      const result = typeInfo(TYPES.SmallDateTime, { value: null }, options);

      assert.deepEqual(result, expected);
    });
  });

  describe('.validate', function() {
    it('returns a TypeError for dates that are out of range', function() {
      assert.throws(() => {
        TYPES.SmallDateTime.validate(new Date('Dec 31, 1889'), undefined);
      }, TypeError, 'Out of range.');

      assert.throws(() => {
        TYPES.SmallDateTime.validate(new Date('Jan 1, 2080'), undefined);
      }, TypeError, 'Out of range.');

      assert.throws(() => {
        TYPES.SmallDateTime.validate(new Date('June 7, 2079'), undefined);
      }, TypeError, 'Out of range.');
    });
  });
});

describe('SmallInt', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.SmallInt, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.SmallInt, { value: 123 }, options).length, Buffer.from([0x02]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts `number` values', function() {
      const value = 2;
      const expected = Buffer.from('0200', 'hex');

      const type = TYPES.SmallInt;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.SmallInt;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.SmallInt;
      const expected = Buffer.from([0x26, 2]);

      const result = typeInfo(type, { value: null }, options);
      assert.deepEqual(result, expected);
    });
  });

  describe('.validate', function() {
    it('throws Invalid number error for NaN input', function() {
      assert.throws(() => {
        TYPES.SmallInt.validate('string', undefined);
      }, TypeError, 'Invalid number.');
    });

    it('throws Out of Range error for numbers out of range', function() {
      assert.throws(() => {
        TYPES.SmallInt.validate(-32768 - 1, undefined);
      }, TypeError, 'Value must be between -32768 and 32767, inclusive.');

      assert.throws(() => {
        TYPES.SmallInt.validate(32767 + 1, undefined);
      }, TypeError, 'Value must be between -32768 and 32767, inclusive.');
    });
  });
});

describe('SmallMoney', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.SmallMoney, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.SmallMoney, { value: 123 }, options).length, Buffer.from([0x04]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts `number` values', function() {
      const value = 2;
      const expected = Buffer.from('204e0000', 'hex');

      const type = TYPES.SmallMoney;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.SmallMoney;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    describe('.validate', function() {
      it('throws Invalid number error for NaN input', function() {
        assert.throws(() => {
          TYPES.SmallMoney.validate('string', undefined);
        }, TypeError, 'Invalid number.');
      });

      it('throws Out of Range error for numbers out of range', function() {
        assert.throws(() => {
          TYPES.SmallMoney.validate(-214748.3648 - 0.0001, undefined);
        }, TypeError, 'Value must be between -214748.3648 and 214748.3647.');

        assert.throws(() => {
          TYPES.SmallMoney.validate(214748.3647 + 0.0001, undefined);
        }, TypeError, 'Value must be between -214748.3648 and 214748.3647.');
      });
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.SmallMoney;
      const expected = Buffer.from([0x6E, 4]);

      const result = typeInfo(type, { value: null }, options);
      assert.deepEqual(result, expected);
    });
  });
});

describe('Text', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.Text, { value: null, length: -1 }, options).length, Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]));
      assert.deepEqual(serialize(TYPES.Text, { value: Buffer.from('Hello World', 'ascii'), length: 11 }, options).length, Buffer.from([0x0B, 0x00, 0x00, 0x00]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts `Buffer` values', function() {
      const value = Buffer.from('Hello World', 'ascii');
      const expected = Buffer.from('48656c6c6f20576f726c64', 'hex');

      const type = TYPES.Text;
      const parameterValue = { value, length: 15 };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.Text;
      const parameterValue = { value, length: -1 };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.Text;
      const expected = Buffer.from([0x23, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

      const result = typeInfo(type, { value: null, length: 1 }, options);
      assert.deepEqual(result, expected);
    });
  });
});

describe('Time', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.Time, { value: null, scale: 0 }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.Time, { value: null, scale: 1 }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.Time, { value: null, scale: 2 }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.Time, { value: null, scale: 3 }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.Time, { value: null, scale: 4 }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.Time, { value: null, scale: 5 }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.Time, { value: null, scale: 6 }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.Time, { value: null, scale: 7 }, options).length, Buffer.from([0x00]));

      assert.deepEqual(serialize(TYPES.Time, { value: new Date(), scale: 0 }, options).length, Buffer.from([0x03]));
      assert.deepEqual(serialize(TYPES.Time, { value: new Date(), scale: 1 }, options).length, Buffer.from([0x03]));
      assert.deepEqual(serialize(TYPES.Time, { value: new Date(), scale: 2 }, options).length, Buffer.from([0x03]));
      assert.deepEqual(serialize(TYPES.Time, { value: new Date(), scale: 3 }, options).length, Buffer.from([0x04]));
      assert.deepEqual(serialize(TYPES.Time, { value: new Date(), scale: 4 }, options).length, Buffer.from([0x04]));
      assert.deepEqual(serialize(TYPES.Time, { value: new Date(), scale: 5 }, options).length, Buffer.from([0x05]));
      assert.deepEqual(serialize(TYPES.Time, { value: new Date(), scale: 6 }, options).length, Buffer.from([0x05]));
      assert.deepEqual(serialize(TYPES.Time, { value: new Date(), scale: 7 }, options).length, Buffer.from([0x05]));
    });
  });
  describe('.compileWriter data', function() {
    // Test rounding of nanosecondDelta
    it('correctly converts `Date` values with a `nanosecondDelta` property', function() {
      const type = TYPES.Time;
      // Date with nanosecondDelta is an extended Date type used by the library for sub-millisecond precision
      interface DateWithNanosecondDelta extends Date {
        nanosecondDelta: number;
      }
      interface TimeTestCase {
        value: DateWithNanosecondDelta;
        scale: number;
        expectedBuffer: Buffer;
      }

      const createTestDate = (date: Date, nanosecondDelta: number): DateWithNanosecondDelta => {
        const d = date as DateWithNanosecondDelta;
        d.nanosecondDelta = nanosecondDelta;
        return d;
      };

      const testCases: TimeTestCase[] = [
        { value: createTestDate(new Date(2017, 6, 29, 17, 20, 3, 503), 0.0006264), scale: 7, expectedBuffer: Buffer.from('68fc624b91', 'hex') },
        { value: createTestDate(new Date(2017, 9, 1, 1, 31, 4, 12), 0.0004612), scale: 7, expectedBuffer: Buffer.from('c422ceb80c', 'hex') },
        { value: createTestDate(new Date(2017, 7, 3, 12, 52, 28, 373), 0.0007118), scale: 7, expectedBuffer: Buffer.from('1e94c8e96b', 'hex') }
      ];

      for (const { value, scale, expectedBuffer } of testCases) {
        const parameter = { value, scale };
        const buffer = serialize(type, parameter, optionsWithUTCFalse).data;
        assert.deepEqual(buffer, expectedBuffer);
      }
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.Time;
      const expected = Buffer.from([0x29, 1]);

      const reuslt = typeInfo(type, { value: null, scale: 1 }, options);
      assert.deepEqual(reuslt, expected);
    });
  });
});

describe('TinyInt', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.TinyInt, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.TinyInt, { value: 4 }, options).length, Buffer.from([0x01]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts `number` values', function() {
      const value = 1;
      const expected = Buffer.from('01', 'hex');

      const type = TYPES.TinyInt;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.TinyInt;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const type = TYPES.TinyInt;
      const expected = Buffer.from([0x26, 1]);

      const result = typeInfo(type, { value: null }, options);
      assert.deepEqual(result, expected);
    });
  });

  describe('.validate', function() {
    it('throws Invalid number error for NaN input', function() {
      assert.throws(() => {
        TYPES.TinyInt.validate('string', undefined);
      }, TypeError, 'Invalid number.');
    });

    it('throws Out of Range error for numbers out of range', function() {
      assert.throws(() => {
        TYPES.TinyInt.validate(-1, undefined);
      }, TypeError, 'Value must be between 0 and 255, inclusive.');

      assert.throws(() => {
        TYPES.TinyInt.validate(256, undefined);
      }, TypeError, 'Value must be between 0 and 255, inclusive.');
    });
  });
});

describe('TVP', function() {
  describe('.declaration', function() {
    it('returns type name with readonly', function() {
      const result = TYPES.TVP.declaration({
        value: { name: 'MyTableType', schema: '', columns: [], rows: [] }
      } as any);
      assert.strictEqual(result, 'MyTableType readonly');
    });

    it('includes schema when present', function() {
      const result = TYPES.TVP.declaration({
        value: { name: 'UDT_StringArray', schema: 'AI', columns: [], rows: [] }
      } as any);
      assert.strictEqual(result, 'AI.UDT_StringArray readonly');
    });

    it('works with null schema', function() {
      const result = TYPES.TVP.declaration({
        value: { name: 'MyTableType', schema: null, columns: [], rows: [] }
      } as any);
      assert.strictEqual(result, 'MyTableType readonly');
    });

    it('works with undefined schema', function() {
      const result = TYPES.TVP.declaration({
        value: { name: 'MyTableType', columns: [], rows: [] }
      } as any);
      assert.strictEqual(result, 'MyTableType readonly');
    });
  });

  describe('.writeValue', function() {
    // A TVP's rows are written as the rest of the write.
    async function write(parameter: ParameterData, options: InternalConnectionOptions) {
      const buffer = new WritableTrackingBuffer();
      const rest = TYPES.TVP.compileWriter(parameter, options)(buffer, parameter.value);
      if (rest !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of rest) { }
      }
      return buffer.data;
    }

    it('writes the column count, the columns, the rows and the end token', async function() {
      const value = {
        columns: [{ name: 'user_id', type: TYPES.Int }],
        rows: [[ 15 ]]
      };
      const expected = Buffer.from('01000000000000002604000001040f00000000', 'hex');

      assert.deepEqual(await write({ value }, optionsWithUTCFalse), expected);
    });

    it('writes `null` values as a null table', async function() {
      const expected = Buffer.from([0xFF, 0xFF, 0x00, 0x00]);

      assert.deepEqual(await write({ value: null }, optionsWithUTCFalse), expected);
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const expected = Buffer.from([0xF3, 0x00, 0x00, 0x00]);

      const result = typeInfo(TYPES.TVP, { value: null }, options);
      assert.deepEqual(result, expected);
    });
  });
});

describe('UniqueIdentifier', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.UniqueIdentifier, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.UniqueIdentifier, { value: 'e062ae34-6de5-47f3-8ba3-29d25f77e71a' }, options).length, Buffer.from([0x10]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts `string` values', function() {
      const value = 'e062ae34-6de5-47f3-8ba3-29d25f77e71a';

      const expected = Buffer.from('34ae62e0e56df3478ba329d25f77e71a', 'hex');
      const parameterValue = { value };

      const buffer = serialize(TYPES.UniqueIdentifier, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;

      const expected = Buffer.from([]);
      const parameterValue = { value };

      const buffer = serialize(TYPES.UniqueIdentifier, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      const expected = Buffer.from([0x24, 0x10]);

      const result = typeInfo(TYPES.UniqueIdentifier, { value: null }, options);
      assert.deepEqual(result, expected);
    });
  });

  describe('.validate', function() {
    it('returns the given value for values that match the UUID format', function() {
      const expected = 'e062ae34-6de5-47f3-8ba3-29d25f77e71a';
      const actual = TYPES.UniqueIdentifier.validate(expected, undefined);
      assert.strictEqual(actual, expected);
    });

    it("returns a TypeError for values that don't match the UUID format", function() {
      assert.throws(() => {
        TYPES.UniqueIdentifier.validate('invalid', undefined);
      }, TypeError, 'Invalid GUID.');
    });
  });
});

describe('VarBinary', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.VarBinary, { value: null, length: 10 }, options).length, Buffer.from([0xFF, 0xFF]));
      assert.deepEqual(serialize(TYPES.VarBinary, { value: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), length: 10 }, options).length, Buffer.from([0x04, 0x00]));

      assert.deepEqual(serialize(TYPES.VarBinary, { value: null, length: 10000 }, options).length, Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
      assert.deepEqual(serialize(TYPES.VarBinary, { value: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), length: 10000 }, options).length, Buffer.from([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts `null` values', function() {
      const testCases: Array<{ value: null, length: number, expected: Buffer }> = [
        { value: null, length: 1, expected: Buffer.from([]) },
        { value: null, length: 9000, expected: Buffer.from([]) }
      ];
      for (const { value, length, expected } of testCases) {
        const parameterValue = { value, length };
        const buffer = serialize(TYPES.VarBinary, parameterValue, optionsWithUTCFalse).data;
        assert.deepEqual(buffer, expected);
      }
    });

    it('correctly converts `Buffer` values', function() {
      const testCases: Array<{ value: Buffer, length: number, expected: Buffer }> = [
        { value: Buffer.from('3100', 'hex'), length: 2, expected: Buffer.from('3100', 'hex') },
      ];
      for (const { value, length, expected } of testCases) {
        const parameterValue = { value, length };
        const buffer = serialize(TYPES.VarBinary, parameterValue, optionsWithUTCFalse).data;
        assert.deepEqual(buffer, expected);
      }
    });

    it('correctly converts `Buffer` values (Length <= Maximum Length)', function() {
      const value = Buffer.from('3100', 'hex');
      const length = 2;
      const expected = Buffer.from('3100', 'hex');
      const parameterValue = { value, length };

      const buffer = serialize(TYPES.VarBinary, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `Buffer` values (Length > Maximum Length)', function() {
      const value = Buffer.from('3100', 'hex');
      const length = 9000;
      const expected = Buffer.from('02000000310000000000', 'hex');
      const parameterValue = { value, length };

      const buffer = serialize(TYPES.VarBinary, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values (Length <= Maximum Length)', function() {
      const value = null;
      const length = 1;
      const expected = Buffer.from([]);
      const parameterValue = { value, length };

      const buffer = serialize(TYPES.VarBinary, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values (Length > Maximum Length)', function() {
      const value = null;
      const length = 9000;
      const expected = Buffer.from([]);
      const parameterValue = { value, length };

      const buffer = serialize(TYPES.VarBinary, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      // Length <= Maximum Length
      const expected = Buffer.from([0xA5, 0x01, 0x00]);

      const result = typeInfo(TYPES.VarBinary, { value: null, length: 1 }, options);
      assert.deepEqual(result, expected);

      // Length > Maximum Length
      const expected1 = Buffer.from([0xA5, 0xFF, 0xFF]);

      const result1 = typeInfo(TYPES.VarBinary, { value: null, length: 8500 }, options);
      assert.deepEqual(result1, expected1);
    });
  });
});

describe('VarChar', function() {
  describe('.compileWriter length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.VarChar, { value: null, length: 10 }, options).length, Buffer.from([0xFF, 0xFF]));
      assert.deepEqual(serialize(TYPES.VarChar, { value: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), length: 10 }, options).length, Buffer.from([0x04, 0x00]));

      assert.deepEqual(serialize(TYPES.VarChar, { value: null, length: 10000 }, options).length, Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
      assert.deepEqual(serialize(TYPES.VarChar, { value: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), length: 10000 }, options).length, Buffer.from([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
    });
  });

  describe('.compileWriter data', function() {
    it('correctly converts `Buffer` values (Length <= Maximum Length)', function() {
      const value = Buffer.from('hello world');
      const length = 1;
      const expected = Buffer.from('68656c6c6f20776f726c64', 'hex');
      const parameterValue = { value, length };

      const buffer = serialize(TYPES.VarChar, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `Buffer` values (Length > Maximum Length)', function() {
      const value = Buffer.from('hello world');
      const length = 9000;
      const expected = Buffer.from('0b00000068656c6c6f20776f726c6400000000', 'hex');
      const parameterValue = { value, length };

      const buffer = serialize(TYPES.VarChar, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values (Length <= Maximum Length)', function() {
      const value = null;
      const length = 1;
      const expected = Buffer.from([]);
      const parameterValue = { value, length };

      const buffer = serialize(TYPES.VarChar, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values (Length > Maximum Length)', function() {
      const value = null;
      const length = 9000;
      const expected = Buffer.from([]);
      const parameterValue = { value, length };

      const buffer = serialize(TYPES.VarChar, parameterValue, optionsWithUTCFalse).data;
      assert.deepEqual(buffer, expected);
    });
  });

  describe('.writeTypeInfo', function() {
    it('returns the correct type information', function() {
      // Length <= Maximum Length
      const expected = Buffer.from('a7010000000000000', 'hex');

      const result = typeInfo(TYPES.VarChar, { value: null, length: 1 }, options);
      assert.deepEqual(result, expected);

      // Length > Maximum Length
      const expected1 = Buffer.from('a7ffff0000000000', 'hex');

      const result2 = typeInfo(TYPES.VarChar, { value: null, length: 8500 }, options);
      assert.deepEqual(result2, expected1);
    });
  });
});
