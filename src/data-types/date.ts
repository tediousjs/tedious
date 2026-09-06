import { type DataType } from '../data-type';
import { daysSinceYearOne } from './temporal';

// globalDate is to be used for JavaScript's global 'Date' object to avoid name clashing with the 'Date' constant below
const globalDate = global.Date;
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

  writeValue(buffer, parameter, options) {
    const value = parameter.value as globalThis.Date | null;
    if (value == null) {
      buffer.writeUInt8(0x00);
      return;
    }

    buffer.writeUInt8(0x03);
    buffer.writeUInt24LE(daysSinceYearOne(value, options.useUTC));
  },

  // TODO: value is technically of type 'unknown'.
  validate: function(value, collation, options): null | Date {
    if (value == null) {
      return null;
    }

    if (!(value instanceof globalDate)) {
      value = new globalDate(globalDate.parse(value));
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

export default Date;
module.exports = Date;
