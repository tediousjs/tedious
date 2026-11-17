import { type DataType } from '../data-type';
import { checkRange, daysSinceYearOne, MAX_DATETIME2, MIN_DATETIME2, toPlainDate, type Temporal } from './temporal';

const TYPE_INFO = Buffer.from([0x28]);

const Date: DataType = {
  id: 0x28,
  type: 'DATEN',
  name: 'Date',

  declaration: function() {
    return 'date';
  },

  writeTypeInfo(buffer) {
    buffer.writeBuffer(TYPE_INFO);
  },

  writeValue(buffer, parameter) {
    const value = parameter.value as Temporal.PlainDate | null;
    if (value == null) {
      buffer.writeUInt8(0x00);
      return;
    }

    buffer.writeUInt8(0x03);
    buffer.writeUInt24LE(daysSinceYearOne(value));
  },

  validate: function(value): null | Temporal.PlainDate {
    if (value == null) {
      return null;
    }

    const date = toPlainDate(value);
    checkRange(date, MIN_DATETIME2, MAX_DATETIME2);
    return date;
  }
};

export default Date;
module.exports = Date;
