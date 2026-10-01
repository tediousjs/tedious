import { type DataType } from '../data-type';
import DateTimeN from './datetimen';

const EPOCH_DATE = new Date(1900, 0, 1);
const UTC_EPOCH_DATE = new Date(Date.UTC(1900, 0, 1));

const TYPE_INFO = Buffer.from([DateTimeN.id, 0x04]);

const SmallDateTime: DataType = {
  id: 0x3A,
  type: 'DATETIM4',
  name: 'SmallDateTime',

  declaration: function() {
    return 'smalldatetime';
  },

  writeTypeInfo(buffer) {
    buffer.writeBuffer(TYPE_INFO);
  },

  compileWriter(column, options) {
    const collation = column.collation;
    const useUTC = options.useUTC;
    return (buffer, raw) => {
      const value = SmallDateTime.validate(raw, collation) as Date | null;
      if (value == null) {
        buffer.writeUInt8(0x00);
        return;
      }

      let days: number, minutes: number;
      if (useUTC) {
        days = Math.floor((value.getTime() - UTC_EPOCH_DATE.getTime()) / (1000 * 60 * 60 * 24));
        minutes = (value.getUTCHours() * 60) + value.getUTCMinutes();
      } else {
        const dstDiff = -(value.getTimezoneOffset() - EPOCH_DATE.getTimezoneOffset()) * 60 * 1000;
        days = Math.floor((value.getTime() - EPOCH_DATE.getTime() + dstDiff) / (1000 * 60 * 60 * 24));
        minutes = (value.getHours() * 60) + value.getMinutes();
      }

      buffer.writeUInt8(0x04);
      buffer.writeUInt16LE(days);
      buffer.writeUInt16LE(minutes);
    };
  },

  validate: function(value, collation, options): null | Date {
    if (value == null) {
      return null;
    }

    if (!(value instanceof Date)) {
      value = new Date(Date.parse(value));
    }

    value = value as Date;

    let year, month, date;
    if (options && options.useUTC) {
      year = value.getUTCFullYear();
      month = value.getUTCMonth();
      date = value.getUTCDate();
    } else {
      year = value.getFullYear();
      month = value.getMonth();
      date = value.getDate();
    }

    if (year < 1900 || year > 2079) {
      throw new TypeError('Out of range.');
    }

    if (year === 2079) {
      // Month is 0-indexed, i.e. Jan = 0, Dec = 11
      // See: https://learn.microsoft.com/en-us/sql/t-sql/data-types/smalldatetime-transact-sql?view=sql-server-ver16
      if (month > 5 || (month === 5 && date > 6)) {
        throw new TypeError('Out of range.');
      }
    }

    if (isNaN(value)) {
      throw new TypeError('Invalid date.');
    }

    return value;
  }
};

export default SmallDateTime;
module.exports = SmallDateTime;
