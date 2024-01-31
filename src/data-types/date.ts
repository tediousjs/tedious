import { type DataType } from '../data-type';
import { ChronoUnit, LocalDate } from '@js-joda/core';

// globalDate is to be used for JavaScript's global 'Date' object to avoid name clashing with the 'Date' constant below
const globalDate = global.Date;
const EPOCH_DATE = LocalDate.ofYearDay(1, 1);
const NULL_LENGTH = Buffer.from([0x00]);
const DATA_LENGTH = Buffer.from([0x03]);

const MIN_DATE = new globalDate('January 1, 0001');
const MAX_DATE = new globalDate('December 31, 9999');

const Date: DataType = {
  id: 0x28,
  type: 'DATEN',
  name: 'Date',

  declaration: function() {
    return 'date';
  },

  generateTypeInfo: function() {
    return Buffer.from([this.id]);
  },

  generateParameterLength(parameter, options) {
    if (parameter.value == null) {
      return NULL_LENGTH;
    }

    return DATA_LENGTH;
  },

  * generateParameterData(parameter, options) {
    if (parameter.value == null) {
      return;
    }

    const value = parameter.value as any; // Temporary solution. Remove 'any' later.

    let date: LocalDate;
    if (options.useUTC) {
      date = LocalDate.of(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
    } else {
      date = LocalDate.of(value.getFullYear(), value.getMonth() + 1, value.getDate());
    }

    const days = EPOCH_DATE.until(date, ChronoUnit.DAYS);
    const buffer = Buffer.alloc(3);
    buffer.writeUIntLE(days, 0, 3);
    yield buffer;
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

    // TODO: check date range: January 1, 0001, through December 31, 9999
    //    : time range: 00:00:00 through 23:59:59.997
    if (options && options.useUTC) {
      value = new globalDate(value.toUTCString());
    }

    if (value < MIN_DATE || value > MAX_DATE) {
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
