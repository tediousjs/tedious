import { type DataType } from '../data-type';
import DateTimeN from './datetimen';
import { getTemporal, type Temporal } from '../temporal';
import { plainDateToEpochDays, EPOCH_1900 } from '../temporal-conversion';

const DATA_LENGTH = Buffer.from([0x04]);
const NULL_LENGTH = Buffer.from([0x00]);

// SQL Server `smalldatetime` is a zoneless wall-clock date and time, represented
// as a `Temporal.PlainDateTime` (native resolution is one minute).
const SmallDateTime: DataType = {
  id: 0x3A,
  type: 'DATETIM4',
  name: 'SmallDateTime',

  declaration: function() {
    return 'smalldatetime';
  },

  generateTypeInfo() {
    return Buffer.from([DateTimeN.id, 0x04]);
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

    const value = parameter.value as Temporal.PlainDateTime;

    const buffer = Buffer.alloc(4);

    const days = plainDateToEpochDays(value.toPlainDate(), EPOCH_1900);
    const minutes = (value.hour * 60) + value.minute;

    buffer.writeUInt16LE(days, 0);
    buffer.writeUInt16LE(minutes, 2);

    yield buffer;
  },

  validate: function(value, collation, options): null | Temporal.PlainDateTime {
    if (value == null) {
      return null;
    }

    const Temporal = getTemporal();

    let dateTime: Temporal.PlainDateTime;
    if (value instanceof Temporal.PlainDateTime) {
      dateTime = value;
    } else if (value instanceof Temporal.ZonedDateTime) {
      dateTime = value.toPlainDateTime();
    } else if (value instanceof Temporal.PlainDate) {
      dateTime = value.toPlainDateTime();
    } else {
      try {
        dateTime = Temporal.PlainDateTime.from(value as any);
      } catch {
        throw new TypeError('Invalid date.');
      }
    }

    if (dateTime.year < 1900 || dateTime.year > 2079) {
      throw new TypeError('Out of range.');
    }

    if (dateTime.year === 2079) {
      // See: https://learn.microsoft.com/en-us/sql/t-sql/data-types/smalldatetime-transact-sql
      if (dateTime.month > 6 || (dateTime.month === 6 && dateTime.day > 6)) {
        throw new TypeError('Out of range.');
      }
    }

    return dateTime;
  }
};

export default SmallDateTime;
module.exports = SmallDateTime;
