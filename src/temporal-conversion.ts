import { getTemporal, type Temporal } from './temporal';

// SQL Server `date`, `datetime2` and `datetimeoffset` count days from 0001-01-01.
const EPOCH_0001 = '0001-01-01';
// Legacy `datetime` and `smalldatetime` count from 1900-01-01.
const EPOCH_1900 = '1900-01-01';

const NANOS_PER_DAY_FIELDS = {
  hour: 3_600_000_000_000,
  minute: 60_000_000_000,
  second: 1_000_000_000,
  millisecond: 1_000_000,
  microsecond: 1_000,
  nanosecond: 1
};

/** Number of whole days between the given epoch and `date`. */
export function plainDateToEpochDays(date: Temporal.PlainDate, epoch: string = EPOCH_0001): number {
  const Temporal = getTemporal();
  return Temporal.PlainDate.from(epoch).until(date, { largestUnit: 'day' }).days;
}

/** Inverse of {@link plainDateToEpochDays}. */
export function epochDaysToPlainDate(days: number, epoch: string = EPOCH_0001): Temporal.PlainDate {
  const Temporal = getTemporal();
  return Temporal.PlainDate.from(epoch).add({ days });
}

/**
 * Convert a time-of-day to the integer SQL Server stores on the wire: the
 * number of 10^-scale-second increments since midnight (scale 0..7).
 */
export function plainTimeToScaledTicks(time: Temporal.PlainTime, scale: number): number {
  const nanosOfDay =
    time.hour * NANOS_PER_DAY_FIELDS.hour +
    time.minute * NANOS_PER_DAY_FIELDS.minute +
    time.second * NANOS_PER_DAY_FIELDS.second +
    time.millisecond * NANOS_PER_DAY_FIELDS.millisecond +
    time.microsecond * NANOS_PER_DAY_FIELDS.microsecond +
    time.nanosecond;

  return Math.round(nanosOfDay / Math.pow(10, 9 - scale));
}

/** Inverse of {@link plainTimeToScaledTicks}. */
export function scaledTicksToPlainTime(ticks: number, scale: number): Temporal.PlainTime {
  const Temporal = getTemporal();

  const nanosOfDay = ticks * Math.pow(10, 9 - scale);

  const nanosecond = nanosOfDay % 1000;
  const microsecond = Math.floor(nanosOfDay / 1_000) % 1000;
  const millisecond = Math.floor(nanosOfDay / 1_000_000) % 1000;
  const totalSeconds = Math.floor(nanosOfDay / 1_000_000_000);
  const second = totalSeconds % 60;
  const minute = Math.floor(totalSeconds / 60) % 60;
  const hour = Math.floor(totalSeconds / 3600);

  return new Temporal.PlainTime(hour, minute, second, millisecond, microsecond, nanosecond);
}

/** Format a UTC offset in minutes as an ISO offset string, e.g. `+05:30`. */
export function offsetMinutesToString(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

export { EPOCH_0001, EPOCH_1900 };
