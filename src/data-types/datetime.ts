import { type DataType } from '../data-type';
import DateTimeN from './datetimen';
import { getTemporal, type Temporal } from '../temporal';
import { plainDateToEpochDays, EPOCH_1900 } from '../temporal-conversion';

const THREE_HUNDREDTHS = 3 + (1 / 3);
const NULL_LENGTH = Buffer.from([0x00]);
const DATA_LENGTH = Buffer.from([0x08]);

// SQL Server `datetime` is a zoneless wall-clock date and time, represented as
// a `Temporal.PlainDateTime` (native resolution is ~3.33ms).
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

    const value = parameter.value as Temporal.PlainDateTime;

    let days = plainDateToEpochDays(value.toPlainDate(), EPOCH_1900);

    const milliseconds = ((value.hour * 60 + value.minute) * 60 + value.second) * 1000 + value.millisecond;

    let threeHundredthsOfSecond = Math.round(milliseconds / THREE_HUNDREDTHS);

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

    if (dateTime.year < 1753 || dateTime.year > 9999) {
      throw new TypeError('Out of range.');
    }

    return dateTime;
  }
};

export default DateTime;
module.exports = DateTime;
