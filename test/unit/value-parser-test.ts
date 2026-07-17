import { assert } from 'chai';

import { readValue } from '../../src/value-parser';
import { type Metadata } from '../../src/metadata-parser';
import { type ParserOptions } from '../../src/token/stream-parser';
import { type DataType, typeByName as dataTypeByName } from '../../src/data-type';
import { codepageByLanguageId, codepageBySortId } from '../../src/collation';
import iconv from 'iconv-lite';

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

  describe('for `varchar` and `char` values', function() {
    function buildCharMetadata(type: DataType, codepage: string): Metadata {
      const metadata = buildMetadata(type);
      metadata.collation = { codepage } as unknown as Metadata['collation'];
      return metadata;
    }

    function buildCharBuffer(data: Buffer): Buffer {
      const buf = Buffer.alloc(2 + data.length);
      buf.writeUInt16LE(data.length, 0);
      data.copy(buf, 2);
      return buf;
    }

    it('should parse ASCII values in different codepages', function() {
      const data = Buffer.from('user12345@example.com, The quick brown fox!', 'latin1');

      for (const codepage of ['CP1252', 'CP437', 'CP850', 'CP932', 'CP936', 'utf8']) {
        const buf = buildCharBuffer(data);
        const result = readValue(buf, 0, buildCharMetadata(dataTypeByName.VarChar, codepage), utcOptions);

        assert.strictEqual(result.value, 'user12345@example.com, The quick brown fox!', codepage);
        assert.strictEqual(result.offset, buf.length, codepage);
      }
    });

    it('should parse values containing non-ASCII single-byte characters', function() {
      // "café" in CP1252: 0xE9 is "é"
      const buf = buildCharBuffer(Buffer.from([0x63, 0x61, 0x66, 0xE9]));
      const result = readValue(buf, 0, buildCharMetadata(dataTypeByName.VarChar, 'CP1252'), utcOptions);

      assert.strictEqual(result.value, 'café');
      assert.strictEqual(result.offset, buf.length);
    });

    it('should parse values containing multi-byte characters', function() {
      // "あA" in CP932 (Shift-JIS): 0x82 0xA0 is "あ"
      const buf = buildCharBuffer(Buffer.from([0x82, 0xA0, 0x41]));
      const result = readValue(buf, 0, buildCharMetadata(dataTypeByName.VarChar, 'CP932'), utcOptions);

      assert.strictEqual(result.value, 'あA');
      assert.strictEqual(result.offset, buf.length);
    });

    it('should decode ASCII bytes natively for every codepage a collation can produce', function() {
      // The native fast path in `readChars` is gated on a hardcoded list of
      // ASCII compatible codepages. Verify that every codepage that can come
      // out of the collation tables (plus the `utf8` fallback encoding)
      // actually decodes the 7-bit ASCII range identically to ASCII, and
      // that `readValue` takes the same result either way.
      const codepages = new Set([...Object.values(codepageByLanguageId), ...Object.values(codepageBySortId), 'utf-8', 'utf8']);

      const probe = Buffer.alloc(128);
      for (let i = 0; i < 128; i++) {
        probe[i] = i;
      }

      for (const codepage of codepages) {
        assert.strictEqual(iconv.decode(probe, codepage), probe.toString('latin1'), codepage);

        const buf = buildCharBuffer(Buffer.from('plain ASCII value', 'latin1'));
        const result = readValue(buf, 0, buildCharMetadata(dataTypeByName.VarChar, codepage), utcOptions);
        assert.strictEqual(result.value, 'plain ASCII value', codepage);
      }
    });

    it('should parse ASCII values in codepages that do not decode ASCII bytes as ASCII', function() {
      // In UTF-16BE, the ASCII bytes "ab" decode to a single character (U+6162).
      const buf = buildCharBuffer(Buffer.from('ab', 'latin1'));
      const result = readValue(buf, 0, buildCharMetadata(dataTypeByName.VarChar, 'utf-16be'), utcOptions);

      assert.strictEqual(result.value, '慢');
    });

    it('should parse empty values', function() {
      const buf = buildCharBuffer(Buffer.alloc(0));
      const result = readValue(buf, 0, buildCharMetadata(dataTypeByName.VarChar, 'CP1252'), utcOptions);

      assert.strictEqual(result.value, '');
      assert.strictEqual(result.offset, buf.length);
    });

    it('should parse `NULL` values', function() {
      const buf = Buffer.alloc(2);
      buf.writeUInt16LE(0xFFFF, 0);

      const result = readValue(buf, 0, buildCharMetadata(dataTypeByName.VarChar, 'CP1252'), utcOptions);

      assert.isNull(result.value);
      assert.strictEqual(result.offset, buf.length);
    });

    it('should parse `char` values', function() {
      const buf = buildCharBuffer(Buffer.from('fixed     ', 'latin1'));
      const result = readValue(buf, 0, buildCharMetadata(dataTypeByName.Char, 'CP1252'), utcOptions);

      assert.strictEqual(result.value, 'fixed     ');
    });

    it('should parse values that are ASCII except for the final byte', function() {
      const buf = buildCharBuffer(Buffer.from([0x61, 0x62, 0x63, 0xFC])); // "abcü" in CP1252
      const result = readValue(buf, 0, buildCharMetadata(dataTypeByName.VarChar, 'CP1252'), utcOptions);

      assert.strictEqual(result.value, 'abcü');
    });
  });
});
