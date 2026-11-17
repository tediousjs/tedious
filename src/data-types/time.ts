import { type DataType } from '../data-type';
import { roundTimeOfDay, timeLength, toPlainTime, writeTimeIntervals, type Temporal } from './temporal';

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

  writeValue(buffer, parameter) {
    const value = parameter.value as Temporal.PlainTime | null;
    if (value == null) {
      buffer.writeUInt8(0x00);
      return;
    }

    // A time that rounds up to midnight wraps around to 00:00, like
    // `Temporal.PlainTime#round` does.
    const { intervals } = roundTimeOfDay(value, parameter.scale!);

    buffer.writeUInt8(timeLength(parameter.scale));
    writeTimeIntervals(buffer, intervals, parameter.scale!);
  },

  validate: function(value): null | Temporal.PlainTime {
    if (value == null) {
      return null;
    }

    return toPlainTime(value);
  }
};

export default Time;
module.exports = Time;
