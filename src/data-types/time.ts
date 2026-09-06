import { type DataType } from '../data-type';
import { timeLength, writeTimeOfDay, type TemporalValue } from './temporal';

const Time: DataType = {
  id: 0x29,
  type: 'TIMEN',
  name: 'Time',

  declaration: function(parameter) {
    return 'time(' + (this.resolveScale!(parameter)) + ')';
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
      const value = Time.validate(raw, undefined) as TemporalValue | null;
      if (value == null) {
        buffer.writeUInt8(0x00);
        return;
      }

      buffer.writeUInt8(timeLength(scale));
      writeTimeOfDay(buffer, value, scale!, useUTC);
    };
  },

  validate: function(value): null | number | Date {
    if (value == null) {
      return null;
    }

    if (!(value instanceof Date)) {
      value = new Date(Date.parse(value));
    }

    if (isNaN(value)) {
      throw new TypeError('Invalid time.');
    }

    return value;
  }
};

export default Time;
module.exports = Time;
