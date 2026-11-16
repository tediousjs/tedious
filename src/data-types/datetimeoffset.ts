import { type DataType } from '../data-type';
import { daysSinceYearOne, timeLength, writeTimeOfDay, type TemporalValue } from './temporal';

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
    const value = parameter.value as TemporalValue | null;
    if (value == null) {
      buffer.writeUInt8(0x00);
      return;
    }

    buffer.writeUInt8(timeLength(parameter.scale) + 5);
    writeTimeOfDay(buffer, value, parameter.scale!, true);
    buffer.writeUInt24LE(daysSinceYearOne(value, true));
    // A `Date` read from a `datetimeoffset` keeps the offset it was written
    // with; any other is written with the host's.
    buffer.writeInt16LE(value.offsetMinutes ?? -value.getTimezoneOffset());
  },

  validate: function(value: any, collation, options): null | number {
    if (value == null) {
      return null;
    }

    if (!(value instanceof Date)) {
      value = new Date(Date.parse(value));
    }

    value = value as Date;

    let year;
    if (options && options.useUTC) {
      year = value.getUTCFullYear();
    } else {
      year = value.getFullYear();
    }

    if (year < 1 || year > 9999) {
      throw new TypeError('Out of range.');
    }

    if (isNaN(value)) {
      throw new TypeError('Invalid date.');
    }

    const offsetMinutes = (value as TemporalValue).offsetMinutes;
    if (offsetMinutes != null && !(Number.isInteger(offsetMinutes) && offsetMinutes >= -840 && offsetMinutes <= 840)) {
      throw new TypeError('The offset must be a whole number of minutes from -840 to 840.');
    }

    return value;
  }
};

export default DateTimeOffset;
module.exports = DateTimeOffset;
