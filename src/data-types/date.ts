import { type DataType } from '../data-type';
import { getTemporal, type Temporal } from '../temporal';
import { plainDateToEpochDays } from '../temporal-conversion';

const NULL_LENGTH = Buffer.from([0x00]);
const DATA_LENGTH = Buffer.from([0x03]);

// SQL Server `date` is a calendar date with no time-of-day and no time zone,
// represented as a `Temporal.PlainDate`.
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

    const value = parameter.value as Temporal.PlainDate;

    const days = plainDateToEpochDays(value);
    const buffer = Buffer.alloc(3);
    buffer.writeUIntLE(days, 0, 3);
    yield buffer;
  },

  validate: function(value, collation, options): null | Temporal.PlainDate {
    if (value == null) {
      return null;
    }

    const Temporal = getTemporal();

    let date: Temporal.PlainDate;
    if (value instanceof Temporal.PlainDate) {
      date = value;
    } else if (value instanceof Temporal.PlainDateTime || value instanceof Temporal.ZonedDateTime) {
      date = value.toPlainDate();
    } else {
      try {
        date = Temporal.PlainDate.from(value as any);
      } catch {
        throw new TypeError('Invalid date.');
      }
    }

    if (date.year < 1 || date.year > 9999) {
      throw new TypeError('Out of range.');
    }

    return date;
  }
};

export default Date;
module.exports = Date;
