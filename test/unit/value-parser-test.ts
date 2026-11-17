import { assert } from 'chai';
import { Temporal } from 'temporal-polyfill';

import { readValue } from '../../src/value-parser';
import { type Metadata } from '../../src/metadata-parser';
import { type ParserOptions } from '../../src/token/stream-parser';
import { type DataType, typeByName as dataTypeByName } from '../../src/data-type';

const utcOptions = { useUTC: true } as ParserOptions;
const localOptions = { useUTC: false } as ParserOptions;

function buildMetadata(type: DataType, scale?: number): Metadata {
  return {
    userType: 0,
    flags: 0,
    type: type,
    collation: undefined,
    precision: undefined,
    scale: scale,
    dataLength: undefined,
    schema: undefined,
    udtInfo: undefined
  };
}

/**
 * Number of days between `0001-01-01` and the given date - the on-the-wire
 * representation used by `date`, `datetime2` and `datetimeoffset` values.
 */
function wireDays(isoDate: string): number {
  return (Date.parse(isoDate + 'T00:00:00Z') - Date.parse('2000-01-01T00:00:00Z')) / 86400000 + 730119;
}

function writeTimeBytes(buf: Buffer, offset: number, value: number, byteLength: number): number {
  buf.writeUIntLE(value, offset, byteLength);
  return offset + byteLength;
}

function buildTimeBuffer(value: number, byteLength: number): Buffer {
  const buf = Buffer.alloc(1 + byteLength);
  buf.writeUInt8(byteLength, 0);
  writeTimeBytes(buf, 1, value, byteLength);
  return buf;
}

function buildDateTime2Buffer(timeValue: number, timeByteLength: number, days: number): Buffer {
  const buf = Buffer.alloc(1 + timeByteLength + 3);
  buf.writeUInt8(timeByteLength + 3, 0);
  const offset = writeTimeBytes(buf, 1, timeValue, timeByteLength);
  buf.writeUIntLE(days, offset, 3);
  return buf;
}

function buildDateTimeOffsetBuffer(timeValue: number, timeByteLength: number, days: number, offsetMinutes: number): Buffer {
  const buf = Buffer.alloc(1 + timeByteLength + 3 + 2);
  buf.writeUInt8(timeByteLength + 5, 0);
  let offset = writeTimeBytes(buf, 1, timeValue, timeByteLength);
  buf.writeUIntLE(days, offset, 3);
  offset += 3;
  buf.writeInt16LE(offsetMinutes, offset);
  return buf;
}

// The date and time types no longer depend on `useUTC`: parsing gives the
// same value with either setting.
const allOptions: Array<[string, ParserOptions]> = [['useUTC: true', utcOptions], ['useUTC: false', localOptions]];

describe('readValue', function() {
  describe('for `time` values', function() {
    it('should parse values at every scale', function() {
      // [scale, byteLength, rawValue, expected time]
      const cases: Array<[number, number, number, string]> = [
        [0, 3, 45296, '12:34:56'],
        [1, 3, 863999, '23:59:59.9'],
        [2, 3, 99, '00:00:00.99'],
        [3, 4, 45296789, '12:34:56.789'],
        [4, 4, 452967891, '12:34:56.7891'],
        [5, 5, 4529678912, '12:34:56.78912'],
        [6, 5, 86399999999, '23:59:59.999999'],
        [7, 5, 863999999999, '23:59:59.9999999']
      ];

      for (const [scale, byteLength, rawValue, expected] of cases) {
        for (const [label, options] of allOptions) {
          const buf = buildTimeBuffer(rawValue, byteLength);
          const result = readValue(buf, 0, buildMetadata(dataTypeByName.Time, scale), options);
          const value = result.value as Temporal.PlainTime;

          assert.instanceOf(value, Temporal.PlainTime, `scale ${scale}, ${label}`);
          assert.strictEqual(value.toString(), expected, `scale ${scale}, ${label}`);
          assert.strictEqual(result.offset, buf.length, `scale ${scale}, ${label}`);
        }
      }
    });

    it('should parse midnight', function() {
      const result = readValue(buildTimeBuffer(0, 5), 0, buildMetadata(dataTypeByName.Time, 7), utcOptions);
      assert.strictEqual((result.value as Temporal.PlainTime).toString(), '00:00:00');
    });

    it('should parse `NULL` values', function() {
      const result = readValue(Buffer.from([0x00]), 0, buildMetadata(dataTypeByName.Time, 7), utcOptions);

      assert.isNull(result.value);
      assert.strictEqual(result.offset, 1);
    });
  });

  describe('for `date` values', function() {
    it('should parse values across the supported range', function() {
      for (const isoDate of ['0001-01-01', '0001-03-01', '1582-10-15', '1753-01-01', '1900-03-01', '1969-12-31', '1970-01-01', '2000-01-01', '2000-02-29', '2025-06-15', '9999-12-31']) {
        for (const [label, options] of allOptions) {
          const buf = Buffer.alloc(4);
          buf.writeUInt8(3, 0);
          buf.writeUIntLE(wireDays(isoDate), 1, 3);

          const result = readValue(buf, 0, buildMetadata(dataTypeByName.Date), options);
          const value = result.value as Temporal.PlainDate;

          assert.instanceOf(value, Temporal.PlainDate, `${isoDate}, ${label}`);
          assert.strictEqual(value.toString(), isoDate, `${isoDate}, ${label}`);
          assert.strictEqual(result.offset, buf.length, `${isoDate}, ${label}`);
        }
      }
    });

    it('should parse `NULL` values', function() {
      const result = readValue(Buffer.from([0x00]), 0, buildMetadata(dataTypeByName.Date), utcOptions);

      assert.isNull(result.value);
      assert.strictEqual(result.offset, 1);
    });
  });

  describe('for `datetime2` values', function() {
    it('should parse values at different scales', function() {
      // [scale, time byte length, raw time value, expected time of day]
      const cases: Array<[number, number, number, string]> = [
        [0, 3, 45296, '12:34:56'],
        [3, 4, 45296789, '12:34:56.789'],
        [7, 5, 452967891011, '12:34:56.7891011']
      ];

      for (const [scale, timeByteLength, timeValue, expected] of cases) {
        for (const [label, options] of allOptions) {
          const buf = buildDateTime2Buffer(timeValue, timeByteLength, wireDays('2015-06-04'));
          const result = readValue(buf, 0, buildMetadata(dataTypeByName.DateTime2, scale), options);
          const value = result.value as Temporal.PlainDateTime;

          assert.instanceOf(value, Temporal.PlainDateTime, `scale ${scale}, ${label}`);
          assert.strictEqual(value.toString(), `2015-06-04T${expected}`, `scale ${scale}, ${label}`);
          assert.strictEqual(result.offset, buf.length, `scale ${scale}, ${label}`);
        }
      }
    });

    it('should parse the minimum and maximum representable values', function() {
      const minBuf = buildDateTime2Buffer(0, 3, wireDays('0001-01-01'));
      const minResult = readValue(minBuf, 0, buildMetadata(dataTypeByName.DateTime2, 0), utcOptions);
      assert.strictEqual((minResult.value as Temporal.PlainDateTime).toString(), '0001-01-01T00:00:00');

      const maxBuf = buildDateTime2Buffer(863999999999, 5, wireDays('9999-12-31'));
      const maxResult = readValue(maxBuf, 0, buildMetadata(dataTypeByName.DateTime2, 7), utcOptions);
      assert.strictEqual((maxResult.value as Temporal.PlainDateTime).toString(), '9999-12-31T23:59:59.9999999');
    });

    it('should parse values before the unix epoch', function() {
      const buf = buildDateTime2Buffer(45296, 3, wireDays('1960-05-05'));
      const result = readValue(buf, 0, buildMetadata(dataTypeByName.DateTime2, 0), utcOptions);

      assert.strictEqual((result.value as Temporal.PlainDateTime).toString(), '1960-05-05T12:34:56');
    });

    it('should parse `NULL` values', function() {
      const result = readValue(Buffer.from([0x00]), 0, buildMetadata(dataTypeByName.DateTime2, 7), utcOptions);

      assert.isNull(result.value);
      assert.strictEqual(result.offset, 1);
    });
  });

  describe('for `datetimeoffset` values', function() {
    it('should parse values with positive and negative timezone offsets', function() {
      for (const [offsetMinutes, expected] of [
        [0, '2015-06-04T12:34:56.7891011+00:00[+00:00]'],
        [330, '2015-06-04T18:04:56.7891011+05:30[+05:30]'],
        [-90, '2015-06-04T11:04:56.7891011-01:30[-01:30]'],
        [840, '2015-06-05T02:34:56.7891011+14:00[+14:00]'],
        [-840, '2015-06-03T22:34:56.7891011-14:00[-14:00]']
      ] as Array<[number, string]>) {
        const buf = buildDateTimeOffsetBuffer(452967891011, 5, wireDays('2015-06-04'), offsetMinutes);
        const result = readValue(buf, 0, buildMetadata(dataTypeByName.DateTimeOffset, 7), utcOptions);
        const value = result.value as Temporal.ZonedDateTime;

        assert.instanceOf(value, Temporal.ZonedDateTime, `offset ${offsetMinutes}`);
        // The time portion is in UTC - the offset gives the local time of the value.
        assert.strictEqual(value.toInstant().toString(), '2015-06-04T12:34:56.7891011Z', `offset ${offsetMinutes}`);
        assert.strictEqual(value.toString(), expected, `offset ${offsetMinutes}`);
        assert.strictEqual(result.offset, buf.length, `offset ${offsetMinutes}`);
      }
    });

    it('should parse values at the minimum scale', function() {
      const buf = buildDateTimeOffsetBuffer(45296, 3, wireDays('2015-06-04'), 0);
      const result = readValue(buf, 0, buildMetadata(dataTypeByName.DateTimeOffset, 0), utcOptions);

      assert.strictEqual((result.value as Temporal.ZonedDateTime).toString(), '2015-06-04T12:34:56+00:00[+00:00]');
      assert.strictEqual(result.offset, buf.length);
    });

    it('should parse the minimum and maximum representable values', function() {
      const minBuf = buildDateTimeOffsetBuffer(0, 3, wireDays('0001-01-01'), 840);
      const minResult = readValue(minBuf, 0, buildMetadata(dataTypeByName.DateTimeOffset, 0), utcOptions);
      assert.strictEqual((minResult.value as Temporal.ZonedDateTime).toString(), '0001-01-01T14:00:00+14:00[+14:00]');

      const maxBuf = buildDateTimeOffsetBuffer(863999999999, 5, wireDays('9999-12-31'), -840);
      const maxResult = readValue(maxBuf, 0, buildMetadata(dataTypeByName.DateTimeOffset, 7), utcOptions);
      assert.strictEqual((maxResult.value as Temporal.ZonedDateTime).toString(), '9999-12-31T09:59:59.9999999-14:00[-14:00]');
    });

    it('should parse `NULL` values', function() {
      const result = readValue(Buffer.from([0x00]), 0, buildMetadata(dataTypeByName.DateTimeOffset, 7), utcOptions);

      assert.isNull(result.value);
      assert.strictEqual(result.offset, 1);
    });
  });

  describe('for `smalldatetime` values', function() {
    it('should parse values across the supported range', function() {
      // [days, minutes, expected]
      const cases: Array<[number, number, string]> = [
        [0, 0, '1900-01-01T00:00:00'],
        [2, 14, '1900-01-03T00:14:00'],
        [36524, 720, '2000-01-01T12:00:00'],
        [65535, 1439, '2079-06-06T23:59:00']
      ];

      for (const [days, minutes, expected] of cases) {
        for (const [label, options] of allOptions) {
          const buf = Buffer.alloc(4);
          buf.writeUInt16LE(days, 0);
          buf.writeUInt16LE(minutes, 2);

          const result = readValue(buf, 0, buildMetadata(dataTypeByName.SmallDateTime), options);
          const value = result.value as Temporal.PlainDateTime;

          assert.instanceOf(value, Temporal.PlainDateTime, `days ${days}, ${label}`);
          assert.strictEqual(value.toString(), expected, `days ${days}, ${label}`);
          assert.strictEqual(result.offset, buf.length, `days ${days}, ${label}`);
        }
      }
    });
  });

  describe('for `datetime` values', function() {
    it('should parse values across the supported range', function() {
      // [days, three-hundredths of a second, expected]
      const cases: Array<[number, number, string]> = [
        [-53690, 0, '1753-01-01T00:00:00'],
        [0, 0, '1900-01-01T00:00:00'],
        [2, 45 * 300, '1900-01-03T00:00:45'],
        [36524, 300 * 86399, '2000-01-01T23:59:59'],
        [2958463, 0, '9999-12-31T00:00:00'],
        [2958463, 25919999, '9999-12-31T23:59:59.997']
      ];

      for (const [days, threeHundredths, expected] of cases) {
        for (const [label, options] of allOptions) {
          const buf = Buffer.alloc(8);
          buf.writeInt32LE(days, 0);
          buf.writeUInt32LE(threeHundredths, 4);

          const result = readValue(buf, 0, buildMetadata(dataTypeByName.DateTime), options);
          const value = result.value as Temporal.PlainDateTime;

          assert.instanceOf(value, Temporal.PlainDateTime, `days ${days}, ${label}`);
          assert.strictEqual(value.toString(), expected, `days ${days}, ${label}`);
          assert.strictEqual(result.offset, buf.length, `days ${days}, ${label}`);
        }
      }
    });

    it('should round sub-second fractions to milliseconds', function() {
      for (const [ticks, expected] of [[1, '.003'], [2, '.007'], [299, '.997']] as Array<[number, string]>) {
        const buf = Buffer.alloc(8);
        buf.writeInt32LE(0, 0);
        buf.writeUInt32LE(ticks, 4);

        const result = readValue(buf, 0, buildMetadata(dataTypeByName.DateTime), utcOptions);
        assert.strictEqual((result.value as Temporal.PlainDateTime).toString(), `1900-01-01T00:00:00${expected}`);
      }
    });
  });
});
