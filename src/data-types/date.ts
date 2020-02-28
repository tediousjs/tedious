import { DataType } from '../data-type';
import { ChronoUnit, LocalDate } from '@js-joda/core';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

// globalDate is to be used for JavaScript's global 'Date' object to avoid name clashing with the 'Date' constant below
const globalDate = global.Date;
const EPOCH_DATE = LocalDate.ofYearDay(1, 1);

const Date: DataType = {
  id: 0x28,
  type: 'DATEN',
  name: 'Date',

  declaration: function() {
    return 'date';
  },

  generateTypeInfo: function(buffer) {
    return Buffer.from([this.id]);
  },

  *generateParameterData(parameter, options) {
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.

    if (value != null) {
      const time = new globalDate(value);
      if ('Invalid Date' === time.toString()) {
        throw new TypeError('Invalid date.');
      }
      const buffer = new WritableTrackingBuffer(16);
      buffer.writeUInt8(3);

      let date;
      if (options.useUTC) {
        date = LocalDate.of(time.getUTCFullYear(), time.getUTCMonth() + 1, time.getUTCDate());
      } else {
        date = LocalDate.of(time.getFullYear(), time.getMonth() + 1, time.getDate());
      }

      const days = EPOCH_DATE.until(date, ChronoUnit.DAYS);
      buffer.writeUInt24LE(days);
      yield buffer.data;
    } else {
      yield Buffer.from([0x00]);
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
