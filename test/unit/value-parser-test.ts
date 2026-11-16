import { assert } from 'chai';

import { readValue } from '../../src/value-parser';
import { type Metadata } from '../../src/metadata-parser';
import { type ParserOptions } from '../../src/token/stream-parser';
import { type DataType, typeByName as dataTypeByName } from '../../src/data-type';
import DecimalN from '../../src/data-types/decimaln';
import NumericN from '../../src/data-types/numericn';
import MoneyN from '../../src/data-types/moneyn';

const utcOptions = { useUTC: true } as ParserOptions;
const localOptions = { useUTC: false } as ParserOptions;
const numberOptions = { decimalAsString: false } as ParserOptions;
const stringOptions = { decimalAsString: true } as ParserOptions;

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

type DateWithNanosecondsDelta = Date & { nanosecondsDelta: number };

describe('readValue', function() {
  describe('for `time` values', function() {
    it('should parse values at every scale', function() {
      // [scale, byteLength, rawValue, expected milliseconds since midnight, expected nanosecondsDelta]
      const cases: Array<[number, number, number, number, number]> = [
        [0, 3, 45296, 45296000, 0], // 12:34:56
        [1, 3, 863999, 86399900, 0], // 23:59:59.9
        [2, 3, 99, 990, 0], // 00:00:00.99
        [3, 4, 45296789, 45296789, 0], // 12:34:56.789
        [4, 4, 452967891, 45296789, 1000 / 1e7], // 12:34:56.7891
        [5, 5, 4529678912, 45296789, 1200 / 1e7], // 12:34:56.78912
        [6, 5, 86399999999, 86399999, 9990 / 1e7], // 23:59:59.999999
        [7, 5, 863999999999, 86399999, 9999 / 1e7] // 23:59:59.9999999
      ];

      for (const [scale, byteLength, rawValue, expectedMs, expectedNanosecondsDelta] of cases) {
        const buf = buildTimeBuffer(rawValue, byteLength);
        const result = readValue(buf, 0, buildMetadata(dataTypeByName.Time, scale), utcOptions);
        const value = result.value as DateWithNanosecondsDelta;

        assert.instanceOf(value, Date, `scale ${scale}`);
        assert.strictEqual(value.getTime(), expectedMs, `scale ${scale}`);
        assert.strictEqual(value.nanosecondsDelta, expectedNanosecondsDelta, `scale ${scale}`);
        assert.strictEqual(result.offset, buf.length, `scale ${scale}`);
      }
    });

    it('should parse midnight', function() {
      const result = readValue(buildTimeBuffer(0, 5), 0, buildMetadata(dataTypeByName.Time, 7), utcOptions);
      const value = result.value as DateWithNanosecondsDelta;

      assert.strictEqual(value.getTime(), 0);
      assert.strictEqual(value.nanosecondsDelta, 0);
    });

    it('should parse values as local time when `useUTC` is disabled', function() {
      const result = readValue(buildTimeBuffer(45296789, 4), 0, buildMetadata(dataTypeByName.Time, 3), localOptions);
      const value = result.value as DateWithNanosecondsDelta;

      assert.strictEqual(value.getTime(), new Date(1970, 0, 1, 12, 34, 56, 789).getTime());
    });

    it('should expose `nanosecondsDelta` as a non-enumerable property', function() {
      const result = readValue(buildTimeBuffer(863999999999, 5), 0, buildMetadata(dataTypeByName.Time, 7), utcOptions);
      const value = result.value as DateWithNanosecondsDelta;

      const descriptor = Object.getOwnPropertyDescriptor(value, 'nanosecondsDelta');
      assert.isDefined(descriptor);
      assert.isFalse(descriptor!.enumerable);
      assert.notInclude(Object.keys(value), 'nanosecondsDelta');
    });

    it('should parse `NULL` values', function() {
      const result = readValue(Buffer.from([0x00]), 0, buildMetadata(dataTypeByName.Time, 7), utcOptions);

      assert.isNull(result.value);
      assert.strictEqual(result.offset, 1);
    });
  });

  describe('for `date` values', function() {
    it('should parse values across the supported range', function() {
      for (const isoDate of ['0001-01-01', '1753-01-01', '1969-12-31', '1970-01-01', '2000-01-01', '2025-06-15', '9999-12-31']) {
        const buf = Buffer.alloc(4);
        buf.writeUInt8(3, 0);
        buf.writeUIntLE(wireDays(isoDate), 1, 3);

        const result = readValue(buf, 0, buildMetadata(dataTypeByName.Date), utcOptions);
        const value = result.value as Date;

        assert.instanceOf(value, Date, isoDate);
        assert.strictEqual(value.getTime(), Date.parse(isoDate + 'T00:00:00Z'), isoDate);
        assert.strictEqual(result.offset, buf.length, isoDate);
      }
    });

    it('should parse values as local time when `useUTC` is disabled', function() {
      const buf = Buffer.alloc(4);
      buf.writeUInt8(3, 0);
      buf.writeUIntLE(wireDays('2025-06-15'), 1, 3);

      const result = readValue(buf, 0, buildMetadata(dataTypeByName.Date), localOptions);
      const value = result.value as Date;

      assert.strictEqual(value.getTime(), new Date(2025, 5, 15).getTime());
    });

    it('should parse `NULL` values', function() {
      const result = readValue(Buffer.from([0x00]), 0, buildMetadata(dataTypeByName.Date), utcOptions);

      assert.isNull(result.value);
      assert.strictEqual(result.offset, 1);
    });
  });

  describe('for `datetime2` values', function() {
    it('should parse values at different scales', function() {
      // [scale, time byte length, raw time value, expected milliseconds into the day, expected nanosecondsDelta]
      const cases: Array<[number, number, number, number, number]> = [
        [0, 3, 45296, 45296000, 0], // 12:34:56
        [3, 4, 45296789, 45296789, 0], // 12:34:56.789
        [7, 5, 452967891011, 45296789, 1011 / 1e7] // 12:34:56.7891011
      ];

      for (const [scale, timeByteLength, timeValue, expectedMs, expectedNanosecondsDelta] of cases) {
        const buf = buildDateTime2Buffer(timeValue, timeByteLength, wireDays('2015-06-04'));
        const result = readValue(buf, 0, buildMetadata(dataTypeByName.DateTime2, scale), utcOptions);
        const value = result.value as DateWithNanosecondsDelta;

        assert.instanceOf(value, Date, `scale ${scale}`);
        assert.strictEqual(value.getTime(), Date.parse('2015-06-04T00:00:00Z') + expectedMs, `scale ${scale}`);
        assert.strictEqual(value.nanosecondsDelta, expectedNanosecondsDelta, `scale ${scale}`);
        assert.strictEqual(result.offset, buf.length, `scale ${scale}`);
      }
    });

    it('should parse the minimum and maximum representable values', function() {
      const minBuf = buildDateTime2Buffer(0, 3, wireDays('0001-01-01'));
      const minResult = readValue(minBuf, 0, buildMetadata(dataTypeByName.DateTime2, 0), utcOptions);
      assert.strictEqual((minResult.value as Date).getTime(), Date.parse('0001-01-01T00:00:00Z'));

      const maxBuf = buildDateTime2Buffer(863999999999, 5, wireDays('9999-12-31'));
      const maxResult = readValue(maxBuf, 0, buildMetadata(dataTypeByName.DateTime2, 7), utcOptions);
      const maxValue = maxResult.value as DateWithNanosecondsDelta;
      assert.strictEqual(maxValue.getTime(), Date.parse('9999-12-31T23:59:59.999Z'));
      assert.strictEqual(maxValue.nanosecondsDelta, 9999 / 1e7);
    });

    it('should parse values before the unix epoch', function() {
      const buf = buildDateTime2Buffer(45296, 3, wireDays('1960-05-05'));
      const result = readValue(buf, 0, buildMetadata(dataTypeByName.DateTime2, 0), utcOptions);
      const value = result.value as Date;

      assert.isBelow(value.getTime(), 0);
      assert.strictEqual(value.getTime(), Date.parse('1960-05-05T12:34:56Z'));
    });

    it('should parse values as local time when `useUTC` is disabled', function() {
      const buf = buildDateTime2Buffer(45296789, 4, wireDays('2015-06-04'));
      const result = readValue(buf, 0, buildMetadata(dataTypeByName.DateTime2, 3), localOptions);
      const value = result.value as DateWithNanosecondsDelta;

      assert.strictEqual(value.getTime(), new Date(2015, 5, 4, 12, 34, 56, 789).getTime());
      assert.strictEqual(value.nanosecondsDelta, 0);
    });

    it('should parse `NULL` values', function() {
      const result = readValue(Buffer.from([0x00]), 0, buildMetadata(dataTypeByName.DateTime2, 7), utcOptions);

      assert.isNull(result.value);
      assert.strictEqual(result.offset, 1);
    });
  });

  describe('for `datetimeoffset` values', function() {
    it('should parse values with positive and negative timezone offsets', function() {
      for (const offsetMinutes of [0, 330, -90, 840, -840]) {
        const buf = buildDateTimeOffsetBuffer(452967891011, 5, wireDays('2015-06-04'), offsetMinutes);
        const result = readValue(buf, 0, buildMetadata(dataTypeByName.DateTimeOffset, 7), utcOptions);
        const value = result.value as DateWithNanosecondsDelta;

        assert.instanceOf(value, Date, `offset ${offsetMinutes}`);
        // The time portion is already in UTC - the timezone offset does not shift the value.
        assert.strictEqual(value.getTime(), Date.parse('2015-06-04T12:34:56.789Z'), `offset ${offsetMinutes}`);
        assert.strictEqual(value.nanosecondsDelta, 1011 / 1e7, `offset ${offsetMinutes}`);
        assert.strictEqual(result.offset, buf.length, `offset ${offsetMinutes}`);
      }
    });

    it('should parse values at the minimum scale', function() {
      const buf = buildDateTimeOffsetBuffer(45296, 3, wireDays('2015-06-04'), 0);
      const result = readValue(buf, 0, buildMetadata(dataTypeByName.DateTimeOffset, 0), utcOptions);
      const value = result.value as DateWithNanosecondsDelta;

      assert.strictEqual(value.getTime(), Date.parse('2015-06-04T12:34:56Z'));
      assert.strictEqual(value.nanosecondsDelta, 0);
      assert.strictEqual(result.offset, buf.length);
    });

    it('should parse `NULL` values', function() {
      const result = readValue(Buffer.from([0x00]), 0, buildMetadata(dataTypeByName.DateTimeOffset, 7), utcOptions);

      assert.isNull(result.value);
      assert.strictEqual(result.offset, 1);
    });
  });

  describe('for `smalldatetime` values', function() {
    it('should parse values across the supported range', function() {
      // [days, minutes, expected UTC timestamp]
      const cases: Array<[number, number, number]> = [
        [0, 0, Date.UTC(1900, 0, 1)],
        [2, 14, Date.UTC(1900, 0, 3, 0, 14)],
        [36524, 720, Date.UTC(2000, 0, 1, 12)],
        [65535, 1439, Date.UTC(2079, 5, 6, 23, 59)]
      ];

      for (const [days, minutes, expected] of cases) {
        const buf = Buffer.alloc(4);
        buf.writeUInt16LE(days, 0);
        buf.writeUInt16LE(minutes, 2);

        const result = readValue(buf, 0, buildMetadata(dataTypeByName.SmallDateTime), utcOptions);
        const value = result.value as Date;

        assert.instanceOf(value, Date, `days ${days}`);
        assert.strictEqual(value.getTime(), expected, `days ${days}`);
        assert.strictEqual(result.offset, buf.length, `days ${days}`);
      }
    });

    it('should parse values as local time when `useUTC` is disabled', function() {
      const buf = Buffer.alloc(4);
      buf.writeUInt16LE(2, 0);
      buf.writeUInt16LE(14, 2);

      const result = readValue(buf, 0, buildMetadata(dataTypeByName.SmallDateTime), localOptions);
      const value = result.value as Date;

      assert.strictEqual(value.getTime(), new Date(1900, 0, 3, 0, 14).getTime());
    });
  });

  describe('for `datetime` values', function() {
    it('should parse values across the supported range', function() {
      // [days, three-hundredths of a second, expected UTC timestamp]
      const cases: Array<[number, number, number]> = [
        [-53690, 0, Date.UTC(1753, 0, 1)],
        [0, 0, Date.UTC(1900, 0, 1)],
        [2, 45 * 300, Date.UTC(1900, 0, 3, 0, 0, 45)],
        [36524, 300 * 86399, Date.UTC(2000, 0, 1, 23, 59, 59)],
        [2958463, 0, Date.UTC(9999, 11, 31)]
      ];

      for (const [days, threeHundredths, expected] of cases) {
        const buf = Buffer.alloc(8);
        buf.writeInt32LE(days, 0);
        buf.writeUInt32LE(threeHundredths, 4);

        const result = readValue(buf, 0, buildMetadata(dataTypeByName.DateTime), utcOptions);
        const value = result.value as Date;

        assert.instanceOf(value, Date, `days ${days}`);
        assert.strictEqual(value.getTime(), expected, `days ${days}`);
        assert.strictEqual(result.offset, buf.length, `days ${days}`);
      }
    });

    it('should round sub-second fractions to milliseconds', function() {
      const buf = Buffer.alloc(8);
      buf.writeInt32LE(0, 0);
      buf.writeUInt32LE(299, 4);

      const result = readValue(buf, 0, buildMetadata(dataTypeByName.DateTime), utcOptions);
      const value = result.value as Date;

      assert.strictEqual(value.getTime(), Date.UTC(1900, 0, 1, 0, 0, 0, 997));
    });

    it('should parse values as local time when `useUTC` is disabled', function() {
      const buf = Buffer.alloc(8);
      buf.writeInt32LE(2, 0);
      buf.writeUInt32LE(45 * 300, 4);

      const result = readValue(buf, 0, buildMetadata(dataTypeByName.DateTime), localOptions);
      const value = result.value as Date;

      assert.strictEqual(value.getTime(), new Date(1900, 0, 3, 0, 0, 45).getTime());
    });
  });
});

describe('readValue with `decimalAsString`', function() {
  // A `decimal` or `numeric` value: its length, its sign (1 for positive),
  // then its magnitude as a little-endian unsigned integer.
  function decimalBuffer(sign: number, magnitude: string): Buffer {
    const bytes = Buffer.from(magnitude, 'hex');
    return Buffer.concat([Buffer.from([bytes.length + 1, sign]), bytes]);
  }

  describe('for `decimal` values', function() {
    it('should parse values of every length exactly', function() {
      const cases: [number, number, string, string][] = [
        [2, 1, '96000000', '1.50'],
        [2, 0, '96000000', '-1.50'],
        [0, 1, '2a000000', '42'],
        [0, 1, '0100000000002000', '9007199254740993'],
        [28, 1, 'ffffff0f6102253e5ece4f20', '0.9999999999999999999999999999'],
        [9, 1, '15532a3daa7e22984c360a0000000000', '12345678901234567.123456789'],
        [0, 0, 'ffffffff3f228a097ac4865aa84c3b4b', '-99999999999999999999999999999999999999']
      ];

      for (const [scale, sign, magnitude, expected] of cases) {
        const buf = decimalBuffer(sign, magnitude);
        const result = readValue(buf, 0, buildMetadata(DecimalN, scale), stringOptions);

        assert.strictEqual(result.value, expected);
        assert.strictEqual(result.offset, buf.length);
      }
    });

    it('should parse a negative zero as zero', function() {
      const result = readValue(decimalBuffer(0, '00000000'), 0, buildMetadata(NumericN, 2), stringOptions);
      assert.strictEqual(result.value, '0.00');
    });

    it('should parse values as numbers when the option is off', function() {
      const result = readValue(decimalBuffer(1, '96000000'), 0, buildMetadata(DecimalN, 2), numberOptions);
      assert.strictEqual(result.value, 1.5);
    });

    it('should parse `NULL` values', function() {
      const result = readValue(Buffer.from([0x00]), 0, buildMetadata(DecimalN, 2), stringOptions);
      assert.isNull(result.value);
    });
  });

  describe('for `money` and `smallmoney` values', function() {
    it('should parse values exactly, with four fractional digits', function() {
      const cases: [DataType, string, string][] = [
        [MoneyN, '08ffffff7fffffffff', '922337203685477.5807'],
        [MoneyN, '080000008000000000', '-922337203685477.5808'],
        [MoneyN, '08ffffffffffffffff', '-0.0001'],
        [MoneyN, '0400000080', '-214748.3648'],
        [dataTypeByName.Money, '00000000204bbc00', '1234.0000'],
        [dataTypeByName.SmallMoney, '204e0000', '2.0000']
      ];

      for (const [type, hex, expected] of cases) {
        const buf = Buffer.from(hex, 'hex');
        const result = readValue(buf, 0, buildMetadata(type), stringOptions);

        assert.strictEqual(result.value, expected);
        assert.strictEqual(result.offset, buf.length);
      }
    });

    it('should parse values as numbers when the option is off', function() {
      const result = readValue(Buffer.from('08ffffffffffffffff', 'hex'), 0, buildMetadata(MoneyN), numberOptions);
      assert.strictEqual(result.value, -0.0001);
    });
  });

  describe('for `sql_variant` values', function() {
    it('should parse `decimal` values exactly', function() {
      // The variant's length, the base type and its property length, then
      // the precision and scale, then the value.
      const value = decimalBuffer(0, '15532a3daa7e22984c360a0000000000').subarray(1);
      const header = Buffer.alloc(4);
      header.writeUInt32LE(4 + value.length);
      const buf = Buffer.concat([header, Buffer.from([DecimalN.id, 2, 38, 9]), value]);

      const result = readValue(buf, 0, buildMetadata(dataTypeByName.Variant), stringOptions);
      assert.strictEqual(result.value, '-12345678901234567.123456789');
      assert.strictEqual(result.offset, buf.length);
    });

    it('should parse `money` values exactly', function() {
      const value = Buffer.from('ffffff7fffffffff', 'hex');
      const header = Buffer.alloc(4);
      header.writeUInt32LE(2 + value.length);
      const buf = Buffer.concat([header, Buffer.from([dataTypeByName.Money.id, 0]), value]);

      const result = readValue(buf, 0, buildMetadata(dataTypeByName.Variant), stringOptions);
      assert.strictEqual(result.value, '922337203685477.5807');
    });
  });
});
