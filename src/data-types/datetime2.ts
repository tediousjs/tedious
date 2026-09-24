import { type DataType } from '../data-type';
import { daysSinceYearOne, timeLength, writeTimeOfDay, type TemporalValue } from './temporal';

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

  writeTypeInfo(buffer, parameter) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt8(parameter.scale!);
  },

  compileWriter(column, options) {
    const scale = column.scale;
    const useUTC = options.useUTC;
    return (buffer, raw) => {
      const value = DateTime2.validate(raw, undefined) as TemporalValue | null;
      if (value == null) {
        buffer.writeUInt8(0x00);
        return;
      }

      buffer.writeUInt8(timeLength(scale) + 3);
      writeTimeOfDay(buffer, value, scale!, useUTC);
      buffer.writeUInt24LE(daysSinceYearOne(value, useUTC));
    };
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

    return value;
  }
};

export default DateTime2;
module.exports = DateTime2;
