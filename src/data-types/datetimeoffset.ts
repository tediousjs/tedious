import { type DataType } from '../data-type';
import { checkRange, EPOCH_DAYS_0001_01_01, epochDaysFromDate, MAX_DATETIME2, MIN_DATETIME2, roundTimeOfDay, timeLength, toZonedDateTime, writeTimeIntervals, type Temporal } from './temporal';

const NANOSECONDS_PER_MINUTE = 60_000_000_000;
const MILLISECONDS_PER_DAY = 86_400_000;
const MAX_OFFSET_MINUTES = 14 * 60;

// The range of instants whose UTC date is within 0001-01-01..9999-12-31.
const MIN_EPOCH_MILLISECONDS = EPOCH_DAYS_0001_01_01 * MILLISECONDS_PER_DAY;
const MAX_EPOCH_MILLISECONDS = epochDaysFromDate(10000, 1, 1) * MILLISECONDS_PER_DAY - 1;

/**
 * The date and time of `value` in UTC, as the number of days since
 * 1970-01-01 and the time of day fields. This avoids the comparatively
 * expensive `withTimeZone('UTC')`; the sub-millisecond fields are the same
 * in UTC as in the value's own time zone, as its offset is a whole number of
 * minutes.
 */
function utcDateTime(value: Temporal.ZonedDateTime) {
  const epochMilliseconds = value.epochMilliseconds;
  const epochDays = Math.floor(epochMilliseconds / MILLISECONDS_PER_DAY);
  const millisecondsOfDay = epochMilliseconds - epochDays * MILLISECONDS_PER_DAY;

  return {
    epochDays,
    time: {
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: millisecondsOfDay,
      microsecond: value.microsecond,
      nanosecond: value.nanosecond
    }
  };
}

const DateTimeOffset: DataType & { resolveScale: NonNullable<DataType['resolveScale']> } = {
  id: 0x2B,
  type: 'DATETIMEOFFSETN',
  name: 'DateTimeOffset',
  declaration: function(parameter) {
    return 'datetimeoffset(' + (this.resolveScale(parameter)) + ')';
  },
  resolveScale: function(parameter) {
    if (parameter.scale != null) {
      return parameter.scale;
    } else if (parameter.value === null) {
      return 0;
    } else {
      return 7;
    }
  },

  writeTypeInfo(buffer, parameter) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt8(parameter.scale!);
  },

  writeValue(buffer, parameter) {
    const value = parameter.value as Temporal.ZonedDateTime | null;
    if (value == null) {
      buffer.writeUInt8(0x00);
      return;
    }

    // The date and time are sent in UTC, followed by the offset of the
    // value's time zone at that instant.
    const { epochDays, time } = utcDateTime(value);
    const { carry, intervals } = roundTimeOfDay(time, parameter.scale!);

    buffer.writeUInt8(timeLength(parameter.scale) + 5);
    writeTimeIntervals(buffer, intervals, parameter.scale!);
    buffer.writeUInt24LE(epochDays - EPOCH_DAYS_0001_01_01 + carry);
    buffer.writeInt16LE(value.offsetNanoseconds / NANOSECONDS_PER_MINUTE);
  },

  validate: function(value): null | Temporal.ZonedDateTime {
    if (value == null) {
      return null;
    }

    const zoned = toZonedDateTime(value);

    const offset = zoned.offsetNanoseconds / NANOSECONDS_PER_MINUTE;
    if (!Number.isInteger(offset) || Math.abs(offset) > MAX_OFFSET_MINUTES) {
      throw new TypeError('Invalid time zone offset: datetimeoffset supports whole-minute offsets between -14:00 and +14:00.');
    }

    // Both the value as given and in UTC, which is how it is sent, must be
    // within range.
    checkRange(zoned, MIN_DATETIME2, MAX_DATETIME2);
    const epochMilliseconds = zoned.epochMilliseconds;
    if (epochMilliseconds < MIN_EPOCH_MILLISECONDS || epochMilliseconds > MAX_EPOCH_MILLISECONDS) {
      throw new TypeError('Out of range.');
    }

    return zoned;
  }
};

export default DateTimeOffset;
module.exports = DateTimeOffset;
