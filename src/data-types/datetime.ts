import { type DataType } from '../data-type';
import DateTimeN from './datetimen';
import { ChronoUnit, LocalDate } from '@js-joda/core';

const EPOCH_DATE = LocalDate.ofYearDay(1900, 1);
const NULL_LENGTH = Buffer.from([0x00]);
const DATA_LENGTH = Buffer.from([0x08]);

const DateTime: DataType = {
  id: 0x3D,
  type: 'DATETIME',
  name: 'DateTime',

  declaration: function() {
    return 'datetime';
  },

  generateTypeInfo() {
    return Buffer.from([DateTimeN.id, 0x08]);
  },

  generateParameterLength(parameter, options) {
    if (parameter.value == null) {
      return NULL_LENGTH;
    }

    return DATA_LENGTH;
  },

  generateParameterData: function*(parameter, options) {
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

    let days = EPOCH_DATE.until(date, ChronoUnit.DAYS);

    let milliseconds, threeHundredthsOfSecond;
    if (options.useUTC) {
      let seconds = value.getUTCHours() * 60 * 60;
      seconds += value.getUTCMinutes() * 60;
      seconds += value.getUTCSeconds();
      milliseconds = (seconds * 1000) + value.getUTCMilliseconds();
    } else {
      let seconds = value.getHours() * 60 * 60;
      seconds += value.getMinutes() * 60;
      seconds += value.getSeconds();
      milliseconds = (seconds * 1000) + value.getMilliseconds();
    }

    threeHundredthsOfSecond = milliseconds / (3 + (1 / 3));
    threeHundredthsOfSecond = Math.round(threeHundredthsOfSecond);

    // 25920000 equals one day
    if (threeHundredthsOfSecond === 25920000) {
      days += 1;
      threeHundredthsOfSecond = 0;
    }

    const buffer = Buffer.alloc(8);
    buffer.writeInt32LE(days, 0);
    buffer.writeUInt32LE(threeHundredthsOfSecond, 4);
    yield buffer;
  },

  // TODO: type 'any' needs to be revisited.
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

    if (year < 1753 || year > 9999) {
      throw new TypeError('Out of range.');
    }

    if (isNaN(value)) {
      throw new TypeError('Invalid date.');
    }

    return value;
  }
};

export default DateTime;
module.exports = DateTime;
