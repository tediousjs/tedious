import { typeByName as TYPES, type DataType, type ParameterData } from '../../src/data-type';
import { type InternalConnectionOptions } from '../../src/connection';
import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';

import { assert } from 'chai';
import { Temporal } from 'temporal-polyfill';

// Test options - using type assertion since tests only exercise code paths
// that use a subset of the full InternalConnectionOptions
const options: InternalConnectionOptions = {} as InternalConnectionOptions;

// A stand-in for a Temporal object of another implementation (e.g. a native
// `Temporal`, or another copy of the polyfill), which is only recognizable
// by its `Symbol.toStringTag` and string form.
function foreignTemporal(type: string, value: string) {
  return { [Symbol.toStringTag]: `Temporal.${type}`, toString: () => value };
}

function typeInfo(type: DataType, parameter: ParameterData, options: InternalConnectionOptions) {
  const buffer = new WritableTrackingBuffer();
  type.writeTypeInfo(buffer, parameter, options);
  return buffer.data;
}

// What `writeValue` writes for a parameter, split into the length field and
// the data. A null is signalled in the length field, so writing a null gives
// the field's width.
function serialize(type: DataType, parameter: ParameterData, options: InternalConnectionOptions) {
  const buffer = new WritableTrackingBuffer();
  assert.isUndefined(type.writeValue(buffer, parameter, options));

  const nullBuffer = new WritableTrackingBuffer();
  type.writeValue(nullBuffer, { ...parameter, value: null }, options);

  const bytes = buffer.data;
  return { length: bytes.subarray(0, nullBuffer.length), data: bytes.subarray(nullBuffer.length) };
}

describe('BigInt', function() {
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.BigInt, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.BigInt, { value: 123n }, options).length, Buffer.from([0x08]));
    });
  });

  describe('.writeValue data', function() {
    it('correctly converts `number` values', function() {
      const value = 123456789;
      const expected = Buffer.from('15cd5b0700000000', 'hex');

      const parameterValue = { value: TYPES.BigInt.validate(value, undefined), length: 4 };
      const buffer = serialize(TYPES.BigInt, parameterValue, options).data;

      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `string` values', function() {
      const value = '123456789';
      const expected = Buffer.from('15cd5b0700000000', 'hex');

      const parameterValue = { value: TYPES.BigInt.validate(value, undefined), length: 4 };
      const buffer = serialize(TYPES.BigInt, parameterValue, options).data;

      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const parameterValue = { value, length: 4 };

      const buffer = serialize(TYPES.BigInt, parameterValue, options).data;

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
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.Binary, { value: null, length: 10 }, options).length, Buffer.from([0xFF, 0xFF]));
      assert.deepEqual(serialize(TYPES.Binary, { value: Buffer.alloc(0), length: 0 }, options).length, Buffer.from([0x00, 0x00]));
      assert.deepEqual(serialize(TYPES.Binary, { value: Buffer.alloc(100), length: 100 }, options).length, Buffer.from([0x64, 0x00]));
    });
  });

  describe('.writeValue data', function() {
    it('correctly converts `Buffer` values', function() {
      const value = Buffer.from([0x12, 0x34, 0x00, 0x00]);
      const expected = Buffer.from('12340000', 'hex');
      const parameterValue = { value, length: 4 };

      const buffer = serialize(TYPES.Binary, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('writes shorter values without padding or truncating them', function() {
      const value = Buffer.from('JP');
      const result = serialize(TYPES.Binary, { value, length: 4 }, options);
      assert.deepEqual(result.length, Buffer.from([0x02, 0x00]));
      assert.deepEqual(result.data, value);
    });

    it('defaults an unspecified length to the maximum length', function() {
      const value = Buffer.from('JP');
      const result = serialize(TYPES.Binary, { value }, options);
      assert.deepEqual(result.length, Buffer.from([0x02, 0x00]));
      assert.deepEqual(result.data, value);
    });

    it('treats a JavaScript null length as unspecified', function() {
      const value = Buffer.from('JP');
      // @ts-expect-error JavaScript callers can supply null for an optional length.
      const result = serialize(TYPES.Binary, { value, length: null }, options);
      assert.deepEqual(result.length, Buffer.from([0x02, 0x00]));
      assert.deepEqual(result.data, value);
    });

    it('rejects values longer than the declared length before writing any bytes', function() {
      for (const length of [0, 3]) {
        const buffer = new WritableTrackingBuffer();
        assert.throws(() => TYPES.Binary.writeValue(buffer, { value: Buffer.from('ABCDE'), length }, options),
                      TypeError, `Binary value of 5 bytes exceeds the declared length of ${length}.`);
        assert.strictEqual(buffer.length, 0);
      }
    });

    it('rejects values longer than the default maximum length', function() {
      assert.throws(() => serialize(TYPES.Binary, { value: Buffer.alloc(8001) }, options),
                    TypeError, 'Binary value of 8001 bytes exceeds the declared length of 8000.');
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);
      const parameterValue = { value, length: 4 };

      const buffer = serialize(TYPES.Binary, parameterValue, options).data;
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

  describe('.resolveLength', function() {
    it('never infers a zero length from an empty buffer', function() {
      const parameter = { type: TYPES.Binary, name: 'p', output: false };
      assert.strictEqual(TYPES.Binary.resolveLength!({ ...parameter, value: Buffer.alloc(0) }), 1);
      assert.strictEqual(TYPES.Binary.resolveLength!({ ...parameter, value: Buffer.from('JP') }), 2);
      assert.strictEqual(TYPES.Binary.resolveLength!({ ...parameter, value: null }), 8000);
    });
  });
});

describe('Bit', function() {
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.Bit, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.Bit, { value: true }, options).length, Buffer.from([0x01]));
      assert.deepEqual(serialize(TYPES.Bit, { value: false }, options).length, Buffer.from([0x01]));
    });
  });

  describe('.writeValue data', function() {
    it('correctly converts `number` values', function() {
      const value = 1;
      const expected = Buffer.from([0x01]);
      const parameterValue = { value };

      const buffer = serialize(TYPES.Bit, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);
      const parameterValue = { value };

      const buffer = serialize(TYPES.Bit, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `undefined` values', function() {
      const value = undefined;
      const expected = Buffer.from([]);
      const parameterValue = { value };

      const buffer = serialize(TYPES.Bit, parameterValue, options).data;
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
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.Char, { value: null }, options).length, Buffer.from([0xFF, 0xFF]));
      assert.deepEqual(serialize(TYPES.Char, { value: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]) }, options).length, Buffer.from([0x04, 0x00]));
    });
  });

  describe('.writeValue data', function() {
    it('correctly converts `Buffer` values', function() {
      const value = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]);
      const parameterValue = { value };

      const buffer = serialize(TYPES.Char, parameterValue, options).data;
      assert.deepEqual(buffer, value);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);
      const parameterValue = { value };

      const buffer = serialize(TYPES.Char, parameterValue, options).data;
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
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.Date, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.Date, { value: Temporal.PlainDate.from('2015-06-19') }, options).length, Buffer.from([0x03]));
    });
  });

  describe('.writeValue data', function() {
    it('writes the number of days since 0001-01-01', function() {
      for (const [value, expectedBuffer] of [
        [new Temporal.PlainDate(1, 1, 1), Buffer.from('000000', 'hex')],
        [new Temporal.PlainDate(2015, 6, 18), Buffer.from('163a0b', 'hex')],
        [new Temporal.PlainDate(2015, 6, 19), Buffer.from('173a0b', 'hex')],
        [new Temporal.PlainDate(2015, 6, 20), Buffer.from('183a0b', 'hex')],
        [new Temporal.PlainDate(9999, 12, 31), Buffer.from('dab937', 'hex')]
      ] as [Temporal.PlainDate, Buffer][]) {
        const buffer = serialize(TYPES.Date, { value: value }, options).data;
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
    it('accepts `Temporal.PlainDate` values', function() {
      const value = Temporal.PlainDate.from('2015-06-19');
      assert.strictEqual(TYPES.Date.validate(value, undefined), value);
    });

    it('accepts ISO 8601 strings', function() {
      assert.isTrue(TYPES.Date.validate('2015-06-19', undefined).equals('2015-06-19'));
    });

    it('takes the date of `Temporal.PlainDateTime` and `Temporal.ZonedDateTime` values', function() {
      assert.isTrue(TYPES.Date.validate(Temporal.PlainDateTime.from('2015-06-19T23:59'), undefined).equals('2015-06-19'));
      assert.isTrue(TYPES.Date.validate(Temporal.ZonedDateTime.from('2015-06-19T23:59-05:00[-05:00]'), undefined).equals('2015-06-19'));
    });

    it('accepts Temporal objects of other implementations', function() {
      assert.isTrue(TYPES.Date.validate(foreignTemporal('PlainDate', '2015-06-19'), undefined).equals('2015-06-19'));
    });

    it('converts Temporal objects of other implementations to the ISO 8601 calendar', function() {
      const value = {
        ...foreignTemporal('PlainDate', '5775-03-02[u-ca=hebrew]'),
        withCalendar: (calendar: string) => {
          assert.strictEqual(calendar, 'iso8601');
          return foreignTemporal('PlainDate', '2015-06-19');
        }
      };

      const result = TYPES.Date.validate(value, undefined);
      assert.strictEqual(result.calendarId, 'iso8601');
      assert.isTrue(result.equals('2015-06-19'));
    });

    it('rejects `Date` values', function() {
      assert.throws(() => {
        TYPES.Date.validate(new Date(), undefined);
      }, TypeError, 'expected a Temporal.PlainDate, got Date');
    });

    it('returns a TypeError for dates that are out of range', function() {
      assert.throws(() => {
        TYPES.Date.validate(new Temporal.PlainDate(0, 12, 31), undefined);
      }, TypeError, 'Out of range.');

      assert.throws(() => {
        TYPES.Date.validate(new Temporal.PlainDate(10000, 1, 1), undefined);
      }, TypeError, 'Out of range.');
    });
  });
});

describe('DateTime', function() {
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.DateTime, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.DateTime, { value: Temporal.PlainDateTime.from('2015-06-19T00:00') }, options).length, Buffer.from([0x08]));
    });
  });

  describe('.writeValue data', function() {
    it('writes the number of days since 1900-01-01', function() {
      for (const [value, expectedNoOfDays] of [
        [new Temporal.PlainDateTime(1753, 1, 1), -53690],
        [new Temporal.PlainDateTime(2015, 6, 18, 23, 59, 59), 42171],
        [new Temporal.PlainDateTime(2015, 6, 19, 0, 0, 0), 42172],
        [new Temporal.PlainDateTime(2015, 6, 19, 23, 59, 59), 42172],
        [new Temporal.PlainDateTime(2015, 6, 20, 0, 0, 0), 42173]
      ] as [Temporal.PlainDateTime, number][]) {
        const buffer = serialize(TYPES.DateTime, { value }, options).data;
        assert.strictEqual(buffer.readInt32LE(0), expectedNoOfDays);
      }
    });

    it('rounds the time of day to 1/300 second ticks', function() {
      for (const [value, expectedTicks] of [
        ['2015-06-19T00:00:00.001', 0],
        ['2015-06-19T00:00:00.002', 1],
        ['2015-06-19T00:00:00.003', 1],
        ['2015-06-19T00:00:00.005', 2],
        ['2015-06-19T00:00:00.009', 3],
        ['2015-06-19T23:59:59.997', 25919999]
      ] as [string, number][]) {
        const buffer = serialize(TYPES.DateTime, { value: Temporal.PlainDateTime.from(value) }, options).data;
        assert.strictEqual(buffer.readUInt32LE(4), expectedTicks, value);
      }
    });

    it('carries a time of day that rounds up to midnight into the next day', function() {
      const buffer = serialize(TYPES.DateTime, { value: Temporal.PlainDateTime.from('2015-06-19T23:59:59.999') }, options).data;
      assert.strictEqual(buffer.readInt32LE(0), 42173);
      assert.strictEqual(buffer.readUInt32LE(4), 0);
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
    it('accepts `Temporal.PlainDateTime` values and ISO 8601 strings', function() {
      const value = Temporal.PlainDateTime.from('2015-06-19T12:34:56.789');
      assert.strictEqual(TYPES.DateTime.validate(value, undefined), value);
      assert.isTrue(TYPES.DateTime.validate('2015-06-19T12:34:56.789', undefined).equals(value));
    });

    it('takes `Temporal.PlainDate` values as midnight', function() {
      assert.isTrue(TYPES.DateTime.validate(Temporal.PlainDate.from('2015-06-19'), undefined).equals('2015-06-19T00:00'));
    });

    it('rejects `Date` values', function() {
      assert.throws(() => {
        TYPES.DateTime.validate(new Date(), undefined);
      }, TypeError, 'expected a Temporal.PlainDateTime, got Date');
    });

    it('returns a TypeError for dates that are out of range', function() {
      assert.throws(() => {
        TYPES.DateTime.validate(Temporal.PlainDateTime.from('1752-12-31T23:59:59.999'), undefined);
      }, TypeError, 'Out of range.');

      assert.throws(() => {
        TYPES.DateTime.validate('9999-12-31T23:59:59.999', undefined);
      }, TypeError, 'Out of range.');
    });
  });
});

describe('DateTime2', function() {
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      const value = Temporal.PlainDateTime.from('2015-06-19T12:34:56');
      for (const [scale, length] of [[0, 0x06], [1, 0x06], [2, 0x06], [3, 0x07], [4, 0x07], [5, 0x08], [6, 0x08], [7, 0x08]]) {
        assert.deepEqual(serialize(TYPES.DateTime2, { value: null, scale }, options).length, Buffer.from([0x00]));
        assert.deepEqual(serialize(TYPES.DateTime2, { value, scale }, options).length, Buffer.from([length]));
      }
    });
  });

  describe('.writeValue data', function() {
    it('writes the time of day and the number of days since 0001-01-01', function() {
      for (const [value, expectedBuffer] of [
        [new Temporal.PlainDateTime(2015, 6, 18, 23, 59, 59), Buffer.from('7f5101163a0b', 'hex')],
        [new Temporal.PlainDateTime(2015, 6, 19, 0, 0, 0), Buffer.from('000000173a0b', 'hex')],
        [new Temporal.PlainDateTime(2015, 6, 19, 23, 59, 59), Buffer.from('7f5101173a0b', 'hex')],
        [new Temporal.PlainDateTime(2015, 6, 20, 0, 0, 0), Buffer.from('000000183a0b', 'hex')]
      ] as [Temporal.PlainDateTime, Buffer][]) {
        const buffer = serialize(TYPES.DateTime2, { value: value, scale: 0 }, options).data;
        assert.deepEqual(buffer, expectedBuffer);
      }
    });

    it('keeps sub-millisecond precision at scale 7', function() {
      const value = Temporal.PlainDateTime.from('2015-06-19T00:00:00.1234567');
      const buffer = serialize(TYPES.DateTime2, { value, scale: 7 }, options).data;
      assert.strictEqual(buffer.readUIntLE(0, 5), 1234567);
    });

    it('carries a time of day that rounds up to midnight into the next day', function() {
      const value = Temporal.PlainDateTime.from('2015-06-19T23:59:59.5');
      const buffer = serialize(TYPES.DateTime2, { value, scale: 0 }, options).data;
      assert.deepEqual(buffer, Buffer.from('000000183a0b', 'hex'));
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
    it('accepts `Temporal.PlainDateTime` values and ISO 8601 strings', function() {
      const value = Temporal.PlainDateTime.from('2015-06-19T12:34:56.1234567');
      assert.strictEqual(TYPES.DateTime2.validate(value, undefined), value);
      assert.isTrue(TYPES.DateTime2.validate('2015-06-19T12:34:56.1234567', undefined).equals(value));
    });

    it('accepts Temporal objects of other implementations', function() {
      const result = TYPES.DateTime2.validate(foreignTemporal('PlainDateTime', '2015-06-19T12:34:56.1234567'), undefined);
      assert.isTrue(result.equals('2015-06-19T12:34:56.1234567'));
    });

    it('rejects `Date` values', function() {
      assert.throws(() => {
        TYPES.DateTime2.validate(new Date(), undefined);
      }, TypeError, 'expected a Temporal.PlainDateTime, got Date');
    });

    it('returns a TypeError for dates that are out of range', function() {
      assert.throws(() => {
        TYPES.DateTime2.validate(new Temporal.PlainDateTime(0, 12, 31, 23, 59, 59), undefined);
      }, TypeError, 'Out of range.');

      assert.throws(() => {
        TYPES.DateTime2.validate(new Temporal.PlainDateTime(10000, 1, 1), undefined);
      }, TypeError, 'Out of range.');
    });
  });
});

describe('DateTimeOffset', function() {
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      const value = Temporal.ZonedDateTime.from('2015-06-19T12:34:56+00:00[UTC]');
      for (const [scale, length] of [[0, 0x08], [1, 0x08], [2, 0x08], [3, 0x09], [4, 0x09], [5, 0x0A], [6, 0x0A], [7, 0x0A]]) {
        assert.deepEqual(serialize(TYPES.DateTimeOffset, { value: null, scale }, options).length, Buffer.from([0x00]));
        assert.deepEqual(serialize(TYPES.DateTimeOffset, { value, scale }, options).length, Buffer.from([length]));
      }
    });
  });

  describe('.writeValue data', function() {
    it('writes the date and time in UTC, followed by the offset', function() {
      const value = Temporal.ZonedDateTime.from('2014-02-14T17:59:59.999+00:00[UTC]');
      const buffer = serialize(TYPES.DateTimeOffset, { value, scale: 0 }, options).data;
      assert.deepEqual(buffer, Buffer.from('20fd002d380b0000', 'hex'));
    });

    it('writes the offset of the value in minutes', function() {
      // 2014-02-14T17:59:59.999Z
      for (const [value, offset] of [
        ['2014-02-14T23:29:59.999+05:30[+05:30]', 330],
        ['2014-02-14T12:59:59.999-05:00[America/New_York]', -300],
        ['2014-02-14T18:59:59.999+01:00[Europe/Berlin]', 60]
      ] as [string, number][]) {
        const buffer = serialize(TYPES.DateTimeOffset, { value: Temporal.ZonedDateTime.from(value), scale: 0 }, options).data;
        assert.deepEqual(buffer.subarray(0, 6), Buffer.from('20fd002d380b', 'hex'), value);
        assert.strictEqual(buffer.readInt16LE(6), offset, value);
      }
    });

    it('writes `Temporal.Instant` values in UTC', function() {
      const value = TYPES.DateTimeOffset.validate(Temporal.Instant.from('2014-02-14T17:59:59.999Z'), undefined);
      const buffer = serialize(TYPES.DateTimeOffset, { value, scale: 0 }, options).data;
      assert.deepEqual(buffer, Buffer.from('20fd002d380b0000', 'hex'));
    });

    it('correctly converts `null` values', function() {
      const buffer = serialize(TYPES.DateTimeOffset, { value: null, scale: 0 }, options).data;
      assert.deepEqual(buffer, Buffer.from([]));
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
    it('accepts `Temporal.ZonedDateTime` values', function() {
      const value = Temporal.ZonedDateTime.from('2014-02-14T12:59:59.999-05:00[America/New_York]');
      assert.strictEqual(TYPES.DateTimeOffset.validate(value, undefined), value);
    });

    it('accepts `Temporal.Instant` values, in UTC', function() {
      const result = TYPES.DateTimeOffset.validate(Temporal.Instant.from('2014-02-14T17:59:59.999Z'), undefined);
      assert.strictEqual(result.timeZoneId, 'UTC');
      assert.strictEqual(result.epochMilliseconds, Date.UTC(2014, 1, 14, 17, 59, 59, 999));
    });

    it('accepts ISO 8601 strings with a time zone or UTC offset', function() {
      assert.strictEqual(TYPES.DateTimeOffset.validate('2014-02-14T12:59:59-05:00[America/New_York]', undefined).timeZoneId, 'America/New_York');
      assert.strictEqual(TYPES.DateTimeOffset.validate('2014-02-14T12:59:59-05:00', undefined).timeZoneId, '-05:00');
      assert.strictEqual(TYPES.DateTimeOffset.validate('2014-02-14T17:59:59Z', undefined).timeZoneId, 'UTC');
    });

    it('rejects strings without a time zone or UTC offset', function() {
      assert.throws(() => {
        TYPES.DateTimeOffset.validate('2014-02-14T17:59:59', undefined);
      }, TypeError, 'Invalid date and time with time zone');
    });

    it('accepts Temporal objects of other implementations', function() {
      const result = TYPES.DateTimeOffset.validate(foreignTemporal('ZonedDateTime', '2014-02-14T23:29:59.999+05:30[+05:30]'), undefined);
      assert.strictEqual(result.offset, '+05:30');
      assert.strictEqual(result.epochMilliseconds, Date.UTC(2014, 1, 14, 17, 59, 59, 999));
    });

    it('rejects `Date` values', function() {
      assert.throws(() => {
        TYPES.DateTimeOffset.validate(new Date(), undefined);
      }, TypeError, 'expected a Temporal.ZonedDateTime or Temporal.Instant, got Date');
    });

    it('rejects offsets that are not whole minutes', function() {
      // Local mean time of New York, before standard time zones: -04:56:02
      assert.throws(() => {
        TYPES.DateTimeOffset.validate(Temporal.ZonedDateTime.from('1880-01-01T00:00[America/New_York]'), undefined);
      }, TypeError, 'Invalid time zone offset');
    });

    it('returns a TypeError for dates that are out of range', function() {
      assert.throws(() => {
        TYPES.DateTimeOffset.validate(Temporal.ZonedDateTime.from('0000-12-31T23:59:59+00:00[UTC]'), undefined);
      }, TypeError, 'Out of range.');

      assert.throws(() => {
        TYPES.DateTimeOffset.validate(Temporal.ZonedDateTime.from('+010000-01-01T00:00:00+00:00[UTC]'), undefined);
      }, TypeError, 'Out of range.');

      // In range as given, but not in UTC.
      assert.throws(() => {
        TYPES.DateTimeOffset.validate(Temporal.ZonedDateTime.from('0001-01-01T00:00:00+01:00[+01:00]'), undefined);
      }, TypeError, 'Out of range.');
    });
  });
});

describe('Decimal', function() {
  describe('.writeValue length field', function() {
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

  describe('.writeValue data', function() {
    it('correctly converts `number` values (Precision <= 9)', function() {
      const value = 1.23;
      const expected = Buffer.from('0101000000', 'hex');
      const precision = 1;

      const type = TYPES.Decimal;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = serialize(type, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `number` values (Precision <= 19)', function() {
      const value = 1.23;
      const expected = Buffer.from('010100000000000000', 'hex');
      const precision = 15;

      const type = TYPES.Decimal;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = serialize(type, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `number` values (Precision <= 28)', function() {
      const value = 1.23;
      const expected = Buffer.from('01010000000000000000000000', 'hex');
      const precision = 25;

      const type = TYPES.Decimal;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = serialize(type, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `number` values (Precision > 28)', function() {
      const value = 1.23;
      const expected = Buffer.from('0101000000000000000000000000000000', 'hex');
      const precision = 30;

      const type = TYPES.Decimal;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = serialize(type, parameterValue, options).data;
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
        buffer = serialize(type, parameterValue, options).data;
      });
      assert.deepEqual(buffer, expected);
    });

    it('throws a RangeError when the scaled value overflows the field width', function() {
      const parameterValue = { value: -3.4028234663852886e+38, precision: 7, scale: 4 };

      assert.throws(() => {
        serialize(TYPES.Decimal, parameterValue, options).data;
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
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.Float, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.Float, { value: 1.2345 }, options).length, Buffer.from([0x08]));
    });
  });

  describe('.writeValue data', function() {
    it('correctly converts `number` values', function() {
      const value = 1.2345;
      const expected = Buffer.from('8d976e1283c0f33f', 'hex');

      const type = TYPES.Float;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.Float;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, options).data;
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
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.Image, { value: null, length: -1 }, options).length, Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]));
      assert.deepEqual(serialize(TYPES.Image, { value: Buffer.alloc(10), length: 10 }, options).length, Buffer.from([0x0A, 0x00, 0x00, 0x00]));
    });
  });

  describe('.writeValue data', function() {
    it('correctly converts `Buffer` values', function() {
      const value = Buffer.from('010101', 'hex');

      const type = TYPES.Image;
      const parameterValue = { value, length: 100 };

      const buffer = serialize(type, parameterValue, options).data;
      assert.deepEqual(buffer, value);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.Image;
      const parameterValue = { value, length: -1 };

      const buffer = serialize(type, parameterValue, options).data;
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
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.Int, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.Int, { value: 123 }, options).length, Buffer.from([0x04]));
    });
  });

  describe('.writeValue data', function() {
    it('correctly converts `number` values', function() {
      const value = 1234;
      const expected = Buffer.from('d2040000', 'hex');

      const type = TYPES.Int;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.Int;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, options).data;
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
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.Money, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.Money, { value: 123 }, options).length, Buffer.from([0x08]));
    });
  });

  describe('.writeValue data', function() {
    it('correctly converts `number` values', function() {
      const value = 1234;
      const expected = Buffer.from('00000000204bbc00', 'hex');

      const type = TYPES.Money;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.Money;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, options).data;
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
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.NChar, { value: null }, options).length, Buffer.from([0xFF, 0xFF]));
      assert.deepEqual(serialize(TYPES.NChar, { value: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]) }, options).length, Buffer.from([0x04, 0x00]));
    });
  });

  describe('.writeValue data', function() {
    it('correctly converts `Buffer` values', function() {
      const value = Buffer.from([0xff, 0xff, 0xff, 0xff]);

      const type = TYPES.NChar;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, options).data;
      assert.deepEqual(buffer, value);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.NChar;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, options).data;
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
  describe('.writeValue length field', function() {
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

  describe('.writeValue data', function() {
    it('correctly converts `number` values (Precision <= 9)', function() {
      const value = 1.23;
      const expected = Buffer.from('0101000000', 'hex');
      const precision = 1;

      const type = TYPES.Numeric;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = serialize(type, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `number` values (Precision <= 19)', function() {
      const value = 1.23;
      const expected = Buffer.from('010100000000000000', 'hex');
      const precision = 15;

      const type = TYPES.Numeric;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = serialize(type, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `number` values (Precision <= 28)', function() {
      const value = 1.23;
      const expected = Buffer.from('01010000000000000000000000', 'hex');
      const precision = 25;

      const type = TYPES.Numeric;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = serialize(type, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `number` values (Precision > 28)', function() {
      const value = 1.23;
      const expected = Buffer.from('0101000000000000000000000000000000', 'hex');
      const precision = 30;

      const type = TYPES.Numeric;
      const parameterValue = { value, precision, scale: 0 };

      const buffer = serialize(type, parameterValue, options).data;
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
        buffer = serialize(type, parameterValue, options).data;
      });
      assert.deepEqual(buffer, expected);
    });

    it('throws a RangeError when the scaled value overflows the field width', function() {
      const parameterValue = { value: -3.4028234663852886e+38, precision: 7, scale: 4 };

      assert.throws(() => {
        serialize(TYPES.Numeric, parameterValue, options).data;
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
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.NVarChar, { value: null, length: 10 }, options).length, Buffer.from([0xFF, 0xFF]));
      assert.deepEqual(serialize(TYPES.NVarChar, { value: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), length: 10 }, options).length, Buffer.from([0x04, 0x00]));

      assert.deepEqual(serialize(TYPES.NVarChar, { value: null, length: 10000 }, options).length, Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
      assert.deepEqual(serialize(TYPES.NVarChar, { value: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), length: 10000 }, options).length, Buffer.from([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
    });
  });

  describe('.writeValue data', function() {
    it('correctly converts `Buffer` values (Length <= Maximum Length)', function() {
      const value = Buffer.from([0xff, 0xff]);
      const expected = Buffer.from('ffff', 'hex');
      const length = 1;

      const type = TYPES.NVarChar;
      const parameterValue = { value, length };

      const buffer = serialize(type, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `Buffer` values (Length > Maximum Length)', function() {
      const value = Buffer.from([0xff, 0xff]);
      const expected = Buffer.from('02000000ffff00000000', 'hex');
      const length = 4100;

      const type = TYPES.NVarChar;
      const parameterValue = { value, length };

      const buffer = serialize(type, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `string` values (Length not given)', function() {
      // A length that is left out, as it can be for a TVP column, is sent as
      // `max`, so the value is a PLP value and ends with its terminator.
      const value = '\uffff';
      const expected = Buffer.from('02000000ffff00000000', 'hex');

      const type = TYPES.NVarChar;
      const parameterValue = { value, length: undefined };

      const buffer = serialize(type, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `string` values (Length is NaN)', function() {
      const value = '\uffff';
      const expected = Buffer.from('02000000ffff00000000', 'hex');

      const type = TYPES.NVarChar;
      const parameterValue = { value, length: NaN };

      const buffer = serialize(type, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values (Length <= Maximum Length)', function() {
      const value = null;
      const expected = Buffer.from([]);
      const length = 1;

      const type = TYPES.NVarChar;
      const parameterValue = { value, length };

      const buffer = serialize(type, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values (Length > Maximum Length)', function() {
      const value = null;
      const expected = Buffer.from([]);
      const length = 5000;

      const type = TYPES.NVarChar;
      const parameterValue = { value, length };

      const buffer = serialize(type, parameterValue, options).data;
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

      // Length not given, or not a number
      assert.deepEqual(typeInfo(type, { value: null, length: undefined }, options), expected1);
      assert.deepEqual(typeInfo(type, { value: null, length: NaN }, options), expected1);
    });
  });
});

describe('Real', function() {
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.Real, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.Real, { value: 123.123 }, options).length, Buffer.from([0x04]));
    });
  });

  describe('.writeValue data', function() {
    it('correctly converts `number` values', function() {
      const value = 123.123;
      const expected = Buffer.from('fa3ef642', 'hex');

      const type = TYPES.Real;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.Real;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, options).data;
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
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.SmallDateTime, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.SmallDateTime, { value: Temporal.PlainDateTime.from('2015-06-19T00:00') }, options).length, Buffer.from([0x04]));
    });
  });

  describe('.writeValue data', function() {
    it('writes the number of days since 1900-01-01 and minutes since midnight', function() {
      for (const [value, expectedNoOfDays, expectedMinutes] of [
        [new Temporal.PlainDateTime(1900, 1, 1), 0, 0],
        [new Temporal.PlainDateTime(2015, 6, 18, 23, 59, 59), 42171, 1439],
        [new Temporal.PlainDateTime(2015, 6, 19, 0, 0, 0), 42172, 0],
        [new Temporal.PlainDateTime(2015, 6, 19, 23, 59, 59), 42172, 1439],
        [new Temporal.PlainDateTime(2015, 6, 20, 0, 0, 0), 42173, 0]
      ] as [Temporal.PlainDateTime, number, number][]) {
        const buffer = serialize(TYPES.SmallDateTime, { value }, options).data;

        assert.strictEqual(buffer.readUInt16LE(0), expectedNoOfDays);
        assert.strictEqual(buffer.readUInt16LE(2), expectedMinutes);
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
    it('rejects `Date` values', function() {
      assert.throws(() => {
        TYPES.SmallDateTime.validate(new Date(), undefined);
      }, TypeError, 'expected a Temporal.PlainDateTime, got Date');
    });

    it('returns a TypeError for dates that are out of range', function() {
      assert.throws(() => {
        TYPES.SmallDateTime.validate(Temporal.PlainDateTime.from('1889-12-31T00:00'), undefined);
      }, TypeError, 'Out of range.');

      assert.throws(() => {
        TYPES.SmallDateTime.validate(Temporal.PlainDateTime.from('2080-01-01T00:00'), undefined);
      }, TypeError, 'Out of range.');

      assert.throws(() => {
        TYPES.SmallDateTime.validate(Temporal.PlainDateTime.from('2079-06-07T00:00'), undefined);
      }, TypeError, 'Out of range.');

      assert.isTrue(TYPES.SmallDateTime.validate('2079-06-06T23:59', undefined).equals('2079-06-06T23:59'));
    });
  });
});

describe('SmallInt', function() {
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.SmallInt, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.SmallInt, { value: 123 }, options).length, Buffer.from([0x02]));
    });
  });

  describe('.writeValue data', function() {
    it('correctly converts `number` values', function() {
      const value = 2;
      const expected = Buffer.from('0200', 'hex');

      const type = TYPES.SmallInt;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.SmallInt;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, options).data;
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
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.SmallMoney, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.SmallMoney, { value: 123 }, options).length, Buffer.from([0x04]));
    });
  });

  describe('.writeValue data', function() {
    it('correctly converts `number` values', function() {
      const value = 2;
      const expected = Buffer.from('204e0000', 'hex');

      const type = TYPES.SmallMoney;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.SmallMoney;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, options).data;
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
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.Text, { value: null, length: -1 }, options).length, Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]));
      assert.deepEqual(serialize(TYPES.Text, { value: Buffer.from('Hello World', 'ascii'), length: 11 }, options).length, Buffer.from([0x0B, 0x00, 0x00, 0x00]));
    });
  });

  describe('.writeValue data', function() {
    it('correctly converts `Buffer` values', function() {
      const value = Buffer.from('Hello World', 'ascii');
      const expected = Buffer.from('48656c6c6f20576f726c64', 'hex');

      const type = TYPES.Text;
      const parameterValue = { value, length: 15 };

      const buffer = serialize(type, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.Text;
      const parameterValue = { value, length: -1 };

      const buffer = serialize(type, parameterValue, options).data;
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
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      const value = Temporal.PlainTime.from('12:34:56');
      for (const [scale, length] of [[0, 0x03], [1, 0x03], [2, 0x03], [3, 0x04], [4, 0x04], [5, 0x05], [6, 0x05], [7, 0x05]]) {
        assert.deepEqual(serialize(TYPES.Time, { value: null, scale }, options).length, Buffer.from([0x00]));
        assert.deepEqual(serialize(TYPES.Time, { value, scale }, options).length, Buffer.from([length]));
      }
    });
  });

  describe('.writeValue data', function() {
    it('writes the time of day with sub-millisecond precision', function() {
      for (const [value, scale, expectedBuffer] of [
        ['17:20:03.5036264', 7, Buffer.from('68fc624b91', 'hex')],
        ['01:31:04.0124612', 7, Buffer.from('c422ceb80c', 'hex')],
        ['12:52:28.3737118', 7, Buffer.from('1e94c8e96b', 'hex')]
      ] as [string, number, Buffer][]) {
        const buffer = serialize(TYPES.Time, { value: Temporal.PlainTime.from(value), scale }, options).data;
        assert.deepEqual(buffer, expectedBuffer);
      }
    });

    it('rounds to the scale', function() {
      const value = Temporal.PlainTime.from('00:00:01.25');
      assert.strictEqual(serialize(TYPES.Time, { value, scale: 0 }, options).data.readUIntLE(0, 3), 1);
      assert.strictEqual(serialize(TYPES.Time, { value, scale: 1 }, options).data.readUIntLE(0, 3), 13);
      assert.strictEqual(serialize(TYPES.Time, { value, scale: 2 }, options).data.readUIntLE(0, 3), 125);
    });

    it('wraps a time that rounds up to midnight around to 00:00', function() {
      const value = Temporal.PlainTime.from('23:59:59.5');
      assert.deepEqual(serialize(TYPES.Time, { value, scale: 0 }, options).data, Buffer.from('000000', 'hex'));
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

  describe('.validate', function() {
    it('accepts `Temporal.PlainTime` values and ISO 8601 strings', function() {
      const value = Temporal.PlainTime.from('12:34:56.1234567');
      assert.strictEqual(TYPES.Time.validate(value, undefined), value);
      assert.isTrue(TYPES.Time.validate('12:34:56.1234567', undefined).equals(value));
    });

    it('takes the time of `Temporal.PlainDateTime` values', function() {
      assert.isTrue(TYPES.Time.validate(Temporal.PlainDateTime.from('2015-06-19T12:34:56'), undefined).equals('12:34:56'));
    });

    it('accepts Temporal objects of other implementations', function() {
      assert.isTrue(TYPES.Time.validate(foreignTemporal('PlainTime', '12:34:56.1234567'), undefined).equals('12:34:56.1234567'));
    });

    it('rejects `Date` values', function() {
      assert.throws(() => {
        TYPES.Time.validate(new Date(), undefined);
      }, TypeError, 'expected a Temporal.PlainTime, got Date');
    });
  });
});

describe('TinyInt', function() {
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.TinyInt, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.TinyInt, { value: 4 }, options).length, Buffer.from([0x01]));
    });
  });

  describe('.writeValue data', function() {
    it('correctly converts `number` values', function() {
      const value = 1;
      const expected = Buffer.from('01', 'hex');

      const type = TYPES.TinyInt;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;
      const expected = Buffer.from([]);

      const type = TYPES.TinyInt;
      const parameterValue = { value };

      const buffer = serialize(type, parameterValue, options).data;
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
    // A TVP's `writeValue` returns the rest of the write, whatever its rows.
    async function write(parameter: ParameterData, options: InternalConnectionOptions) {
      const buffer = new WritableTrackingBuffer();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of TYPES.TVP.writeValue(buffer, parameter, options)!) { }
      return buffer.data;
    }

    it('writes the column count, the columns, the rows and the end token', async function() {
      const value = {
        columns: [{ name: 'user_id', type: TYPES.Int }],
        rows: [[ 15 ]]
      };
      const expected = Buffer.from('01000000000000002604000001040f00000000', 'hex');

      assert.deepEqual(await write({ value }, options), expected);
    });

    it('writes `null` values as a null table', async function() {
      const expected = Buffer.from([0xFF, 0xFF, 0x00, 0x00]);

      assert.deepEqual(await write({ value: null }, options), expected);
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
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.UniqueIdentifier, { value: null }, options).length, Buffer.from([0x00]));
      assert.deepEqual(serialize(TYPES.UniqueIdentifier, { value: 'e062ae34-6de5-47f3-8ba3-29d25f77e71a' }, options).length, Buffer.from([0x10]));
    });
  });

  describe('.writeValue data', function() {
    it('correctly converts `string` values', function() {
      const value = 'e062ae34-6de5-47f3-8ba3-29d25f77e71a';

      const expected = Buffer.from('34ae62e0e56df3478ba329d25f77e71a', 'hex');
      const parameterValue = { value };

      const buffer = serialize(TYPES.UniqueIdentifier, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values', function() {
      const value = null;

      const expected = Buffer.from([]);
      const parameterValue = { value };

      const buffer = serialize(TYPES.UniqueIdentifier, parameterValue, options).data;
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
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.VarBinary, { value: null, length: 10 }, options).length, Buffer.from([0xFF, 0xFF]));
      assert.deepEqual(serialize(TYPES.VarBinary, { value: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), length: 10 }, options).length, Buffer.from([0x04, 0x00]));

      assert.deepEqual(serialize(TYPES.VarBinary, { value: null, length: 10000 }, options).length, Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
      assert.deepEqual(serialize(TYPES.VarBinary, { value: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), length: 10000 }, options).length, Buffer.from([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
    });
  });

  describe('.writeValue data', function() {
    it('correctly converts `null` values', function() {
      const testCases: Array<{ value: null, length: number, expected: Buffer }> = [
        { value: null, length: 1, expected: Buffer.from([]) },
        { value: null, length: 9000, expected: Buffer.from([]) }
      ];
      for (const { value, length, expected } of testCases) {
        const parameterValue = { value, length };
        const buffer = serialize(TYPES.VarBinary, parameterValue, options).data;
        assert.deepEqual(buffer, expected);
      }
    });

    it('correctly converts `number` values', function() {
      const testCases: Array<{ value: number, length: number, expected: Buffer }> = [
        { value: 1, length: 1, expected: Buffer.from('3100', 'hex') },
      ];
      for (const { value, length, expected } of testCases) {
        const parameterValue = { value, length };
        const buffer = serialize(TYPES.VarBinary, parameterValue, options).data;
        assert.deepEqual(buffer, expected);
      }
    });

    it('correctly converts `number` values (Length <= Maximum Length)', function() {
      const value = 1;
      const length = 1;
      const expected = Buffer.from('3100', 'hex');
      const parameterValue = { value, length };

      const buffer = serialize(TYPES.VarBinary, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `number` values (Length > Maximum Length)', function() {
      const value = 1;
      const length = 9000;
      const expected = Buffer.from('02000000310000000000', 'hex');
      const parameterValue = { value, length };

      const buffer = serialize(TYPES.VarBinary, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `Buffer` values (Length not given)', function() {
      // A length that is left out, as it can be for a TVP column, is sent as
      // `max`, so the value is a PLP value and ends with its terminator.
      const value = Buffer.from([0x12, 0x34]);
      const expected = Buffer.from('02000000123400000000', 'hex');
      const parameterValue = { value, length: undefined };

      const buffer = serialize(TYPES.VarBinary, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `Buffer` values (Length is NaN)', function() {
      const value = Buffer.from([0x12, 0x34]);
      const expected = Buffer.from('02000000123400000000', 'hex');
      const parameterValue = { value, length: NaN };

      const buffer = serialize(TYPES.VarBinary, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values (Length <= Maximum Length)', function() {
      const value = null;
      const length = 1;
      const expected = Buffer.from([]);
      const parameterValue = { value, length };

      const buffer = serialize(TYPES.VarBinary, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values (Length > Maximum Length)', function() {
      const value = null;
      const length = 9000;
      const expected = Buffer.from([]);
      const parameterValue = { value, length };

      const buffer = serialize(TYPES.VarBinary, parameterValue, options).data;
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

      // Length not given, or not a number
      assert.deepEqual(typeInfo(TYPES.VarBinary, { value: null, length: undefined }, options), expected1);
      assert.deepEqual(typeInfo(TYPES.VarBinary, { value: null, length: NaN }, options), expected1);
    });
  });
});

describe('VarChar', function() {
  describe('.writeValue length field', function() {
    it('returns the correct data length', function() {
      assert.deepEqual(serialize(TYPES.VarChar, { value: null, length: 10 }, options).length, Buffer.from([0xFF, 0xFF]));
      assert.deepEqual(serialize(TYPES.VarChar, { value: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), length: 10 }, options).length, Buffer.from([0x04, 0x00]));

      assert.deepEqual(serialize(TYPES.VarChar, { value: null, length: 10000 }, options).length, Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
      assert.deepEqual(serialize(TYPES.VarChar, { value: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), length: 10000 }, options).length, Buffer.from([0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
    });
  });

  describe('.writeValue data', function() {
    it('correctly converts `Buffer` values (Length <= Maximum Length)', function() {
      const value = Buffer.from('hello world');
      const length = 1;
      const expected = Buffer.from('68656c6c6f20776f726c64', 'hex');
      const parameterValue = { value, length };

      const buffer = serialize(TYPES.VarChar, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `Buffer` values (Length > Maximum Length)', function() {
      const value = Buffer.from('hello world');
      const length = 9000;
      const expected = Buffer.from('0b00000068656c6c6f20776f726c6400000000', 'hex');
      const parameterValue = { value, length };

      const buffer = serialize(TYPES.VarChar, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values (Length <= Maximum Length)', function() {
      const value = null;
      const length = 1;
      const expected = Buffer.from([]);
      const parameterValue = { value, length };

      const buffer = serialize(TYPES.VarChar, parameterValue, options).data;
      assert.deepEqual(buffer, expected);
    });

    it('correctly converts `null` values (Length > Maximum Length)', function() {
      const value = null;
      const length = 9000;
      const expected = Buffer.from([]);
      const parameterValue = { value, length };

      const buffer = serialize(TYPES.VarChar, parameterValue, options).data;
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
