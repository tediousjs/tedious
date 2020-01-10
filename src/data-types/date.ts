import { DataType } from '../data-type';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';
import { ChronoUnit, LocalDate } from '@js-joda/core';

// globalDate is to be used for JavaScript's global 'Date' object to avoid name clashing with the 'Date' constant below
const globalDate = global.Date;
const EPOCH_DATE = LocalDate.ofYearDay(1, 1);

const Date : DataType = {
  id: 0x28,
  type: 'DATEN',
  name: 'Date',

  declaration: function() {
    return 'date';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(this.id);
  },

  // ParameterData<any> is temporary solution. TODO: need to understand what type ParameterData<...> can be.
  writeParameterData: function(buffer, { value }, options, cb) {
    if (value != null) {
      buffer.writeUInt8(3);

      let date;
      if (options.useUTC) {
        date = LocalDate.of(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
      } else {
        date = LocalDate.of(value.getFullYear(), value.getMonth() + 1, value.getDate());
      }

      const days = EPOCH_DATE.until(date, ChronoUnit.DAYS);
      buffer.writeUInt24LE(days);
    } else {
      buffer.writeUInt8(0);
    }
    cb();
  },

  toBuffer: function(parameter, options) {
    const value = parameter.value as Date;

    if (value != null) {
      let date;
      if (options.useUTC) {
        date = LocalDate.of(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
      } else {
        date = LocalDate.of(value.getFullYear(), value.getMonth() + 1, value.getDate());
      }

      const days = EPOCH_DATE.until(date, ChronoUnit.DAYS);
      const buffer = new WritableTrackingBuffer(3);
      buffer.writeUInt24LE(days);

      return buffer.data;
    } else {
      return Buffer.from([]);
    }
  },

  // TODO: value is techincally of type 'unknown'.
  validate: function(value): null | Date | TypeError {
    if (value == null) {
      return null;
    }

    if (!(value instanceof globalDate)) {
      value = new globalDate(globalDate.parse(value));
    }

    if (isNaN(value)) {
      return new TypeError('Invalid date.');
    }

    return value;
  }
};

export default Date;
module.exports = Date;
