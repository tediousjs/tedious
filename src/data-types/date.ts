import { DataType } from '../data-type';
import { Temporal } from '@js-temporal/polyfill';

// globalDate is to be used for JavaScript's global 'Date' object to avoid name clashing with the 'Date' constant below
const EPOCH_DATE = new Temporal.PlainDate(1, 1, 1);
const NULL_LENGTH = Buffer.from([0x00]);
const DATA_LENGTH = Buffer.from([0x03]);
console.log(EPOCH_DATE.toString());
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

    let date;
    if (options.useUTC) {
      date = new Temporal.PlainDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
    } else {
      date = new Temporal.PlainDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
    }
    const days = EPOCH_DATE.until(date).days;
    const buffer = Buffer.alloc(3);
    buffer.writeUIntLE(days, 0, 3);
    yield buffer;
  },

  // TODO: value is techincally of type 'unknown'.
  validate: function(value): null | Temporal.PlainDate {
    if (value == null) {
      return null;
    }

    try {
      if (!(value instanceof Temporal.PlainDate)) {
        value = Temporal.PlainDate.from(value);
      }
    } catch {
      throw new TypeError('Invalid date.');
    }


    if (isNaN(value)) {
      throw new TypeError('Invalid date.');
    }

    return value;
  }
};

export default Date;
module.exports = Date;
