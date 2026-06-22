import { type DataType } from '../data-type';
import { getTemporal, type Temporal } from '../temporal';
import { plainDateToEpochDays, plainTimeToScaledTicks } from '../temporal-conversion';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const NULL_LENGTH = Buffer.from([0x00]);

// SQL Server `datetimeoffset(n)` stores a UTC date and time plus a fixed UTC
// offset. It maps to a `Temporal.ZonedDateTime` in an offset time zone, which
// preserves the local wall-clock time, the offset, and the exact instant.
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

  generateTypeInfo(parameter) {
    return Buffer.from([this.id, parameter.scale!]);
  },

  generateParameterLength(parameter, options) {
    if (parameter.value == null) {
      return NULL_LENGTH;
    }

    switch (parameter.scale) {
      case 0:
      case 1:
      case 2:
        return Buffer.from([0x08]);

      case 3:
      case 4:
        return Buffer.from([0x09]);

      case 5:
      case 6:
      case 7:
        return Buffer.from([0x0A]);

      default:
        throw new Error('invalid scale');
    }
  },

  * generateParameterData(parameter, options) {
    if (parameter.value == null) {
      return;
    }

    const value = parameter.value as Temporal.ZonedDateTime;
    const scale = parameter.scale!;

    const buffer = new WritableTrackingBuffer(16);

    // The date and time are stored on the wire in UTC, with the offset kept
    // separately so the original wall-clock time can be reconstructed.
    const utc = value.withTimeZone('UTC').toPlainDateTime();
    const ticks = plainTimeToScaledTicks(utc.toPlainTime(), scale);

    switch (scale) {
      case 0:
      case 1:
      case 2:
        buffer.writeUInt24LE(ticks);
        break;
      case 3:
      case 4:
        buffer.writeUInt32LE(ticks);
        break;
      case 5:
      case 6:
      case 7:
        buffer.writeUInt40LE(ticks);
    }

    const days = plainDateToEpochDays(utc.toPlainDate());
    buffer.writeUInt24LE(days);

    const offsetMinutes = value.offsetNanoseconds / 60_000_000_000;
    buffer.writeInt16LE(offsetMinutes);
    yield buffer.data;
  },
  validate: function(value, collation, options): null | Temporal.ZonedDateTime {
    if (value == null) {
      return null;
    }

    const Temporal = getTemporal();

    let zoned: Temporal.ZonedDateTime;
    if (value instanceof Temporal.ZonedDateTime) {
      zoned = value;
    } else if (value instanceof Temporal.Instant) {
      zoned = value.toZonedDateTimeISO('UTC');
    } else {
      try {
        zoned = Temporal.ZonedDateTime.from(value as any);
      } catch {
        throw new TypeError('Invalid date.');
      }
    }

    if (zoned.year < 1 || zoned.year > 9999) {
      throw new TypeError('Out of range.');
    }

    return zoned;
  }
};

export default DateTimeOffset;
module.exports = DateTimeOffset;
