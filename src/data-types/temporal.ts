import { ChronoUnit, LocalDate } from '@js-joda/core';
import type WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const YEAR_ONE = LocalDate.ofYearDay(1, 1);

/**
 * A `Date` that may carry the sub-millisecond part of a `time`, `datetime2`
 * or `datetimeoffset` value, as the value parser produces it.
 */
export interface TemporalValue extends Date {
  nanosecondDelta?: number;
}

/**
 * The number of days from 0001-01-01 to the calendar date of `value`.
 */
export function daysSinceYearOne(value: Date, useUTC: boolean): number {
  const date = useUTC ?
    LocalDate.of(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()) :
    LocalDate.of(value.getFullYear(), value.getMonth() + 1, value.getDate());

  return YEAR_ONE.until(date, ChronoUnit.DAYS);
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
 * Writes the time of day of `value` as the number of 10^-scale second
 * intervals since midnight, in `timeLength(scale)` bytes.
 */
export function writeTimeOfDay(buffer: WritableTrackingBuffer, value: TemporalValue, scale: number, useUTC: boolean): void {
  let timestamp = useUTC ?
    ((value.getUTCHours() * 60 + value.getUTCMinutes()) * 60 + value.getUTCSeconds()) * 1000 + value.getUTCMilliseconds() :
    ((value.getHours() * 60 + value.getMinutes()) * 60 + value.getSeconds()) * 1000 + value.getMilliseconds();

  timestamp = timestamp * Math.pow(10, scale - 3);
  timestamp += (value.nanosecondDelta != null ? value.nanosecondDelta : 0) * Math.pow(10, scale);
  timestamp = Math.round(timestamp);

  switch (scale) {
    case 0:
    case 1:
    case 2:
      buffer.writeUInt24LE(timestamp);
      break;
    case 3:
    case 4:
      buffer.writeUInt32LE(timestamp);
      break;
    case 5:
    case 6:
    case 7:
      buffer.writeUInt40LE(timestamp);
  }
}
