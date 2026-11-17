import { Temporal } from 'temporal-polyfill';
import type WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

// The date and time types are based on the TC39 Temporal API. The
// `temporal-polyfill` package is used in "ponyfill" mode: it never installs
// `globalThis.Temporal`, so loading tedious does not change the environment
// of the application using it. Values tedious returns are instances of the
// ponyfill's classes. Values passed in may come from any Temporal
// implementation (the ponyfill, another copy of it, or a native one), see
// the `to*` functions below.
export { Temporal };

const NANOSECONDS_PER_SECOND = 1_000_000_000;
export const NANOSECONDS_PER_DAY = 86_400 * NANOSECONDS_PER_SECOND;

/**
 * The number of days from 1970-01-01 to the given proleptic Gregorian date.
 *
 * This is the `days_from_civil` algorithm from
 * https://howardhinnant.github.io/date_algorithms.html, which works on plain
 * numbers rather than allocating Temporal objects on the hot path of
 * writing every date value.
 */
export function epochDaysFromDate(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/**
 * The `[year, month, day]` of the proleptic Gregorian date that is the given
 * number of days from 1970-01-01. This is the inverse of
 * `epochDaysFromDate` (Hinnant's `civil_from_days`).
 */
function civilFromEpochDays(epochDays: number): [year: number, month: number, day: number] {
  const z = epochDays + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return [yoe + era * 400 + (month <= 2 ? 1 : 0), month, day];
}

/**
 * The `[hour, minute, second, millisecond, microsecond, nanosecond]` of the
 * time of day that is the given number of nanoseconds after midnight.
 */
function timeFields(nanoseconds: number): [number, number, number, number, number, number] {
  const nanosecond = nanoseconds % 1000;
  let rest = (nanoseconds - nanosecond) / 1000;
  const microsecond = rest % 1000;
  rest = (rest - microsecond) / 1000;
  const millisecond = rest % 1000;
  rest = (rest - millisecond) / 1000;
  const second = rest % 60;
  rest = (rest - second) / 60;
  const minute = rest % 60;
  return [(rest - minute) / 60, minute, second, millisecond, microsecond, nanosecond];
}

// Constructing Temporal objects is comparatively expensive, especially with
// the polyfill, so the functions below that the value parser calls for every
// date and time value each construct exactly one object, from plain numbers.

/**
 * The date that is the given number of days from 1970-01-01.
 */
export function dateFromEpochDays(epochDays: number): Temporal.PlainDate {
  const [year, month, day] = civilFromEpochDays(epochDays);
  return new Temporal.PlainDate(year, month, day);
}

/**
 * The time of day that is the given number of nanoseconds after midnight.
 */
export function timeFromNanoseconds(nanoseconds: number): Temporal.PlainTime {
  const [hour, minute, second, millisecond, microsecond, nanosecond] = timeFields(nanoseconds);
  return new Temporal.PlainTime(hour, minute, second, millisecond, microsecond, nanosecond);
}

/**
 * The date and time that is the given number of nanoseconds after midnight
 * of the date that is the given number of days from 1970-01-01.
 */
export function dateTimeFromEpochDays(epochDays: number, nanoseconds: number): Temporal.PlainDateTime {
  const [year, month, day] = civilFromEpochDays(epochDays);
  const [hour, minute, second, millisecond, microsecond, nanosecond] = timeFields(nanoseconds);
  return new Temporal.PlainDateTime(year, month, day, hour, minute, second, millisecond, microsecond, nanosecond);
}

// Day numbers of the epochs the TDS date and time formats count from.
export const EPOCH_DAYS_0001_01_01 = epochDaysFromDate(1, 1, 1);
export const EPOCH_DAYS_1900_01_01 = epochDaysFromDate(1900, 1, 1);

interface DateFields {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

interface TimeFields {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
  readonly microsecond: number;
  readonly nanosecond: number;
}

/**
 * The number of days from 0001-01-01 to the given date.
 */
export function daysSinceYearOne(value: DateFields): number {
  return epochDaysFromDate(value.year, value.month, value.day) - EPOCH_DAYS_0001_01_01;
}

/**
 * The number of nanoseconds from midnight to the given time of day.
 */
export function nanosecondsSinceMidnight(value: TimeFields): number {
  return ((value.hour * 60 + value.minute) * 60 + value.second) * NANOSECONDS_PER_SECOND +
    value.millisecond * 1_000_000 + value.microsecond * 1_000 + value.nanosecond;
}

/**
 * The length in bytes of a `time` value at `scale`, as it prefixes the
 * value and pads out the lengths of `datetime2` and `datetimeoffset`.
 */
export function timeLength(scale: number | undefined): number {
  switch (scale) {
    case 0:
    case 1:
    case 2:
      return 3;
    case 3:
    case 4:
      return 4;
    case 5:
    case 6:
    case 7:
      return 5;
    default:
      throw new Error('invalid scale');
  }
}

/**
 * The number of 10^-scale second intervals in a day.
 */
export function intervalsPerDay(scale: number): number {
  return 86_400 * Math.pow(10, scale);
}

/**
 * Rounds the given number of nanoseconds since midnight to the nearest
 * 10^-scale second interval, rounding half up. The result can be
 * `intervalsPerDay(scale)`, i.e. midnight of the next day, which callers
 * either carry into the date or wrap around.
 */
export function roundToScale(nanoseconds: number, scale: number): number {
  return Math.round(nanoseconds / Math.pow(10, 9 - scale));
}

/**
 * Writes `intervals`, a time of day as the number of 10^-scale second
 * intervals since midnight, in `timeLength(scale)` bytes.
 */
export function writeTimeIntervals(buffer: WritableTrackingBuffer, intervals: number, scale: number): void {
  switch (scale) {
    case 0:
    case 1:
    case 2:
      buffer.writeUInt24LE(intervals);
      break;
    case 3:
    case 4:
      buffer.writeUInt32LE(intervals);
      break;
    case 5:
    case 6:
    case 7:
      buffer.writeUInt40LE(intervals);
  }
}

/**
 * Splits the time of day of a value into the number of whole days to carry
 * (0 or 1, when rounding reached midnight) and the rounded intervals.
 */
export function roundTimeOfDay(value: TimeFields, scale: number): { carry: number, intervals: number } {
  const intervals = roundToScale(nanosecondsSinceMidnight(value), scale);
  const perDay = intervalsPerDay(scale);
  return intervals >= perDay ? { carry: 1, intervals: intervals - perDay } : { carry: 0, intervals };
}

// --- Input coercion ------------------------------------------------------

type TemporalTypeName = 'PlainDate' | 'PlainTime' | 'PlainDateTime' | 'ZonedDateTime' | 'Instant';

/**
 * The name of the Temporal type of `value` (e.g. `'PlainDate'`), if it is a
 * Temporal object from any implementation, as identified by the
 * `Symbol.toStringTag` every Temporal object has (`'Temporal.PlainDate'`).
 */
function temporalTypeOf(value: unknown): TemporalTypeName | 'PlainYearMonth' | 'PlainMonthDay' | 'Duration' | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const tag = (value as { [Symbol.toStringTag]?: unknown })[Symbol.toStringTag];
  if (typeof tag === 'string' && tag.startsWith('Temporal.')) {
    return tag.slice('Temporal.'.length) as TemporalTypeName;
  }

  return undefined;
}

function describe(value: unknown): string {
  const type = temporalTypeOf(value);
  if (type) {
    return `Temporal.${type}`;
  }
  if (value instanceof Date) {
    return 'Date';
  }
  return typeof value;
}

function invalid(expected: string, value: unknown): TypeError {
  let message = `Invalid value: expected ${expected}, got ${describe(value)}.`;
  if (value instanceof Date) {
    message += ' Date objects are not accepted for date and time types, as they do not say which time zone their date and time are in. Convert them with e.g. `Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(timeZone)`.';
  }
  return new TypeError(message);
}

/**
 * Brings a Temporal object of another implementation (e.g. a native
 * `Temporal` while this one is the polyfill, or another copy of the
 * polyfill) into this one, by way of its ISO 8601 string form, which
 * preserves every field exactly. It is first converted to the ISO 8601
 * calendar by its own implementation, which may support calendars this one
 * does not.
 */
function adopt<T>(value: object, from: (item: string) => T): T {
  const { withCalendar } = value as { withCalendar?: (calendar: string) => object };
  return from(String(typeof withCalendar === 'function' ? withCalendar.call(value, 'iso8601') : value));
}

/**
 * `value` in the ISO 8601 calendar, which is the calendar of the values
 * SQL Server stores.
 */
function iso<T extends { calendarId: string, withCalendar(calendar: 'iso8601'): T }>(value: T): T {
  return value.calendarId === 'iso8601' ? value : value.withCalendar('iso8601');
}

/**
 * Parses an ISO 8601 string, rejecting out-of-range fields rather than
 * clamping them, and reporting a malformed string as a `TypeError` like the
 * other data types do.
 */
function parse<T>(value: string, from: (item: string, options: { overflow: 'reject' }) => T, what: string): T {
  try {
    return from(value, { overflow: 'reject' });
  } catch (err) {
    throw new TypeError(`Invalid ${what}: ${JSON.stringify(value)}.`, { cause: err });
  }
}

/**
 * Coerces `value` to a `Temporal.PlainDate` in the ISO 8601 calendar.
 *
 * Accepts a `Temporal.PlainDate`, `Temporal.PlainDateTime` or
 * `Temporal.ZonedDateTime` (its wall-clock date), or an ISO 8601 string.
 */
export function toPlainDate(value: unknown): Temporal.PlainDate {
  switch (temporalTypeOf(value)) {
    case 'PlainDate':
      return iso(value instanceof Temporal.PlainDate ? value : adopt(value as object, Temporal.PlainDate.from));
    case 'PlainDateTime':
      return toPlainDateTime(value).toPlainDate();
    case 'ZonedDateTime':
      return toZonedDateTime(value).toPlainDate();
  }

  if (typeof value === 'string') {
    return iso(parse(value, Temporal.PlainDate.from, 'date'));
  }

  throw invalid('a Temporal.PlainDate', value);
}

/**
 * Coerces `value` to a `Temporal.PlainTime`.
 *
 * Accepts a `Temporal.PlainTime`, `Temporal.PlainDateTime` or
 * `Temporal.ZonedDateTime` (its wall-clock time), or an ISO 8601 string.
 */
export function toPlainTime(value: unknown): Temporal.PlainTime {
  switch (temporalTypeOf(value)) {
    case 'PlainTime':
      return value instanceof Temporal.PlainTime ? value : adopt(value as object, Temporal.PlainTime.from);
    case 'PlainDateTime':
      return toPlainDateTime(value).toPlainTime();
    case 'ZonedDateTime':
      return toZonedDateTime(value).toPlainTime();
  }

  if (typeof value === 'string') {
    return parse(value, Temporal.PlainTime.from, 'time');
  }

  throw invalid('a Temporal.PlainTime', value);
}

/**
 * Coerces `value` to a `Temporal.PlainDateTime` in the ISO 8601 calendar.
 *
 * Accepts a `Temporal.PlainDateTime`, `Temporal.PlainDate` (at midnight) or
 * `Temporal.ZonedDateTime` (its wall-clock date and time), or an ISO 8601
 * string.
 */
export function toPlainDateTime(value: unknown): Temporal.PlainDateTime {
  switch (temporalTypeOf(value)) {
    case 'PlainDateTime':
      return iso(value instanceof Temporal.PlainDateTime ? value : adopt(value as object, Temporal.PlainDateTime.from));
    case 'PlainDate':
      return toPlainDate(value).toPlainDateTime();
    case 'ZonedDateTime':
      return toZonedDateTime(value).toPlainDateTime();
  }

  if (typeof value === 'string') {
    return iso(parse(value, Temporal.PlainDateTime.from, 'date and time'));
  }

  throw invalid('a Temporal.PlainDateTime', value);
}

/**
 * Coerces `value` to a `Temporal.ZonedDateTime` in the ISO 8601 calendar.
 *
 * Accepts a `Temporal.ZonedDateTime`, a `Temporal.Instant` (in UTC), or an
 * ISO 8601 string with a time zone annotation (e.g.
 * `2025-01-01T12:00+01:00[Europe/Berlin]`) or, failing that, a UTC offset
 * (e.g. `2025-01-01T12:00+01:00`, which is then also its time zone).
 */
export function toZonedDateTime(value: unknown): Temporal.ZonedDateTime {
  switch (temporalTypeOf(value)) {
    case 'ZonedDateTime':
      return iso(value instanceof Temporal.ZonedDateTime ? value : adopt(value as object, Temporal.ZonedDateTime.from));
    case 'Instant':
      return (value instanceof Temporal.Instant ? value : adopt(value as object, Temporal.Instant.from)).toZonedDateTimeISO('UTC');
  }

  if (typeof value === 'string') {
    // A string with a UTC offset but no time zone annotation describes an
    // instant at that offset, so the offset becomes its time zone.
    const offset = value.includes('[') || !/[T ]\d/i.test(value) ? undefined : /(Z|[+-]\d{2}(?::?\d{2})?)$/i.exec(value)?.[1];
    const annotated = offset === undefined ? value : `${value}[${offset.toUpperCase() === 'Z' ? 'UTC' : offset}]`;
    return iso(parse(annotated, Temporal.ZonedDateTime.from, 'date and time with time zone'));
  }

  throw invalid('a Temporal.ZonedDateTime or Temporal.Instant', value);
}

/**
 * Throws if `date` is outside of `[min, max]`.
 */
export function checkRange(date: Temporal.PlainDate | Temporal.PlainDateTime, min: Temporal.PlainDateTime, max: Temporal.PlainDateTime): void {
  const value = date instanceof Temporal.PlainDate ? date.toPlainDateTime() : date;
  if (Temporal.PlainDateTime.compare(value, min) < 0 || Temporal.PlainDateTime.compare(value, max) > 0) {
    throw new TypeError('Out of range.');
  }
}

export const MIN_DATETIME2 = new Temporal.PlainDateTime(1, 1, 1);
export const MAX_DATETIME2 = new Temporal.PlainDateTime(9999, 12, 31, 23, 59, 59, 999, 999, 999);
