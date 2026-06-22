import { type DataType } from '../data-type';
import { getTemporal, type Temporal } from '../temporal';
import { plainDateToEpochDays, plainTimeToScaledTicks } from '../temporal-conversion';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const NULL_LENGTH = Buffer.from([0x00]);

// SQL Server `datetime2(n)` is a zoneless wall-clock date and time, represented
// as a `Temporal.PlainDateTime`. Its nanosecond resolution covers all scales.
const DateTime2: DataType & { resolveScale: NonNullable<DataType['resolveScale']> } = {
  id: 0x2A,
  type: 'DATETIME2N',
  name: 'DateTime2',

  declaration: function(parameter) {
    return 'datetime2(' + (this.resolveScale(parameter)) + ')';
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

  generateTypeInfo(parameter, _options) {
    return Buffer.from([this.id, parameter.scale!]);
  },

  generateParameterLength(parameter, options) {
    if (parameter.value == null) {
      return NULL_LENGTH;
    }

    switch (parameter.scale!) {
      case 0:
      case 1:
      case 2:
        return Buffer.from([0x06]);

      case 3:
      case 4:
        return Buffer.from([0x07]);

      case 5:
      case 6:
      case 7:
        return Buffer.from([0x08]);

      default:
        throw new Error('invalid scale');
    }
  },

  *generateParameterData(parameter, options) {
    if (parameter.value == null) {
      return;
    }

    const value = parameter.value as Temporal.PlainDateTime;
    const scale = parameter.scale!;

    const buffer = new WritableTrackingBuffer(16);

    const ticks = plainTimeToScaledTicks(value.toPlainTime(), scale);

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

    const days = plainDateToEpochDays(value.toPlainDate());
    buffer.writeUInt24LE(days);
    yield buffer.data;
  },

  validate: function(value, collation, options): null | Temporal.PlainDateTime {
    if (value == null) {
      return null;
    }

    const Temporal = getTemporal();

    let dateTime: Temporal.PlainDateTime;
    if (value instanceof Temporal.PlainDateTime) {
      dateTime = value;
    } else if (value instanceof Temporal.ZonedDateTime) {
      dateTime = value.toPlainDateTime();
    } else if (value instanceof Temporal.PlainDate) {
      dateTime = value.toPlainDateTime();
    } else {
      try {
        dateTime = Temporal.PlainDateTime.from(value as any);
      } catch {
        throw new TypeError('Invalid date.');
      }
    }

    if (dateTime.year < 1 || dateTime.year > 9999) {
      throw new TypeError('Out of range.');
    }

    return dateTime;
  }
};

export default DateTime2;
module.exports = DateTime2;
