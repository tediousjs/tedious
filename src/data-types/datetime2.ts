import { type DataType } from '../data-type';
import { checkRange, daysSinceYearOne, MAX_DATETIME2, MIN_DATETIME2, roundTimeOfDay, timeLength, toPlainDateTime, writeTimeIntervals, type Temporal } from './temporal';

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

  writeValue(buffer, parameter) {
    const value = parameter.value as Temporal.PlainDateTime | null;
    if (value == null) {
      buffer.writeUInt8(0x00);
      return;
    }

    const { carry, intervals } = roundTimeOfDay(value, parameter.scale!);

    buffer.writeUInt8(timeLength(parameter.scale) + 3);
    writeTimeIntervals(buffer, intervals, parameter.scale!);
    buffer.writeUInt24LE(daysSinceYearOne(value) + carry);
  },

  validate: function(value): null | Temporal.PlainDateTime {
    if (value == null) {
      return null;
    }

    const dateTime = toPlainDateTime(value);
    checkRange(dateTime, MIN_DATETIME2, MAX_DATETIME2);
    return dateTime;
  }
};

export default DateTime2;
module.exports = DateTime2;
