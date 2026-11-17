import { assert } from 'chai';
import { Temporal } from 'temporal-polyfill';

import { typeByName as TYPES, type DataType } from '../../src/data-type';
import { type InternalConnectionOptions } from '../../src/connection';
import { type Metadata } from '../../src/metadata-parser';
import { type ParserOptions } from '../../src/token/stream-parser';
import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';
import { readValue } from '../../src/value-parser';
import { dateFromEpochDays, epochDaysFromDate } from '../../src/data-types/temporal';

const EPOCH = new Temporal.PlainDate(1970, 1, 1);

function metadata(type: DataType, scale?: number): Metadata {
  return { userType: 0, flags: 0, type, collation: undefined, precision: undefined, scale, dataLength: undefined, schema: undefined, udtInfo: undefined };
}

// Writes `value` as a parameter of `type` and reads it back as a column of
// the same type, as a round trip through SQL Server would.
function roundTrip(type: DataType, value: unknown, scale?: number): unknown {
  const validated = type.validate(value, undefined);
  const buffer = new WritableTrackingBuffer();
  type.writeValue(buffer, { value: validated, ...(scale === undefined ? {} : { scale }) }, {} as InternalConnectionOptions);

  // `datetime` and `smalldatetime` parameters are sent as `datetimen`, whose
  // length prefix the plain column types do not have.
  const data = type === TYPES.DateTime || type === TYPES.SmallDateTime ? buffer.data.subarray(1) : buffer.data;
  const result = readValue(data, 0, metadata(type, scale), { useUTC: true } as ParserOptions);
  assert.strictEqual(result.offset, data.length);
  return result.value;
}

describe('Temporal date and time types', function() {
  describe('day number conversions', function() {
    it('agree with Temporal across the supported range', function() {
      // Every 97th day from 0001-01-01 to 9999-12-31, plus the boundaries,
      // which covers every month, leap years and century years.
      const first = epochDaysFromDate(1, 1, 1);
      const last = epochDaysFromDate(9999, 12, 31);
      for (let days = first; days <= last; days += days === last ? 1 : Math.min(97, last - days)) {
        const date = EPOCH.add({ days });
        assert.strictEqual(epochDaysFromDate(date.year, date.month, date.day), days, date.toString());
        assert.isTrue(dateFromEpochDays(days).equals(date), date.toString());
      }
    });

    it('handle leap days', function() {
      for (const date of ['1600-02-29', '1700-02-28', '1700-03-01', '2000-02-29', '2024-02-29']) {
        const value = Temporal.PlainDate.from(date);
        assert.isTrue(dateFromEpochDays(epochDaysFromDate(value.year, value.month, value.day)).equals(value), date);
      }
    });
  });

  describe('round trips', function() {
    it('date', function() {
      for (const value of ['0001-01-01', '1582-10-04', '2000-02-29', '2024-06-15', '9999-12-31']) {
        assert.strictEqual(String(roundTrip(TYPES.Date, value)), value);
      }
    });

    it('time', function() {
      for (const [value, scale, expected] of [
        ['00:00:00', 7, '00:00:00'],
        ['12:34:56.1234567', 7, '12:34:56.1234567'],
        ['12:34:56.1234567', 3, '12:34:56.123'],
        ['12:34:56.1235', 3, '12:34:56.124'],
        ['23:59:59.9999999', 7, '23:59:59.9999999'],
        ['23:59:59.9999999', 6, '00:00:00']
      ] as Array<[string, number, string]>) {
        assert.strictEqual(String(roundTrip(TYPES.Time, value, scale)), expected, `${value} at scale ${scale}`);
      }
    });

    it('datetime2', function() {
      for (const [value, scale, expected] of [
        ['0001-01-01T00:00', 7, '0001-01-01T00:00:00'],
        ['2024-02-29T13:37:42.1234567', 7, '2024-02-29T13:37:42.1234567'],
        ['2024-02-29T13:37:42.1234567', 0, '2024-02-29T13:37:42'],
        ['2024-02-29T23:59:59.9999999', 6, '2024-03-01T00:00:00'],
        ['9999-12-31T23:59:59.9999999', 7, '9999-12-31T23:59:59.9999999']
      ] as Array<[string, number, string]>) {
        assert.strictEqual(String(roundTrip(TYPES.DateTime2, value, scale)), expected, `${value} at scale ${scale}`);
      }
    });

    it('datetimeoffset', function() {
      for (const [value, scale, expected] of [
        ['2024-02-29T13:37:42.1234567+05:30[+05:30]', 7, '2024-02-29T13:37:42.1234567+05:30[+05:30]'],
        // A named time zone comes back as its offset at that instant.
        ['2024-07-01T12:00-04:00[America/New_York]', 0, '2024-07-01T12:00:00-04:00[-04:00]'],
        ['2024-01-01T12:00-05:00[America/New_York]', 0, '2024-01-01T12:00:00-05:00[-05:00]'],
        ['2024-02-29T13:37:42Z', 0, '2024-02-29T13:37:42+00:00[+00:00]'],
        ['0001-01-01T14:00+14:00[+14:00]', 0, '0001-01-01T14:00:00+14:00[+14:00]'],
        ['9999-12-31T09:59:59.9999999-14:00[-14:00]', 7, '9999-12-31T09:59:59.9999999-14:00[-14:00]']
      ] as Array<[string, number, string]>) {
        const result = roundTrip(TYPES.DateTimeOffset, value, scale) as Temporal.ZonedDateTime;
        assert.strictEqual(result.toString(), expected, `${value} at scale ${scale}`);
      }
    });

    it('datetime', function() {
      for (const [value, expected] of [
        ['1753-01-01T00:00', '1753-01-01T00:00:00'],
        ['1900-01-01T00:00:00.001', '1900-01-01T00:00:00'],
        ['1900-01-01T00:00:00.002', '1900-01-01T00:00:00.003'],
        ['1900-01-01T00:00:00.005', '1900-01-01T00:00:00.007'],
        ['2024-02-29T13:37:42.123', '2024-02-29T13:37:42.123'],
        ['2024-02-29T23:59:59.999', '2024-03-01T00:00:00'],
        ['9999-12-31T23:59:59.997', '9999-12-31T23:59:59.997']
      ] as Array<[string, string]>) {
        assert.strictEqual(String(roundTrip(TYPES.DateTime, value)), expected, value);
      }
    });

    it('smalldatetime', function() {
      for (const [value, expected] of [
        ['1900-01-01T00:00', '1900-01-01T00:00:00'],
        ['2024-02-29T13:37:42.123', '2024-02-29T13:37:00'],
        ['2079-06-06T23:59:59', '2079-06-06T23:59:00']
      ] as Array<[string, string]>) {
        assert.strictEqual(String(roundTrip(TYPES.SmallDateTime, value)), expected, value);
      }
    });
  });
});
