import { type DataType } from '../data-type';
import DateTimeN from './datetimen';
import { checkRange, epochDaysFromDate, EPOCH_DAYS_1900_01_01, nanosecondsSinceMidnight, Temporal, toPlainDateTime } from './temporal';

const TYPE_INFO = Buffer.from([DateTimeN.id, 0x08]);

// `datetime` stores the time of day in 1/300 second ticks.
const TICKS_PER_DAY = 25_920_000;

// The latest value that does not round up into the year 10000.
const MIN_DATETIME = new Temporal.PlainDateTime(1753, 1, 1);
const MAX_DATETIME = new Temporal.PlainDateTime(9999, 12, 31, 23, 59, 59, 998, 333, 333);

const DateTime: DataType = {
  id: 0x3D,
  type: 'DATETIME',
  name: 'DateTime',

  declaration: function() {
    return 'datetime';
  },

  writeTypeInfo(buffer) {
    buffer.writeBuffer(TYPE_INFO);
  },

  writeValue(buffer, parameter) {
    const value = parameter.value as Temporal.PlainDateTime | null;
    if (value == null) {
      buffer.writeUInt8(0x00);
      return;
    }

    let days = epochDaysFromDate(value.year, value.month, value.day) - EPOCH_DAYS_1900_01_01;
    // ticks = nanoseconds * 300 / 10^9
    let ticks = Math.round(nanosecondsSinceMidnight(value) * 3 / 10_000_000);

    if (ticks === TICKS_PER_DAY) {
      days += 1;
      ticks = 0;
    }

    buffer.writeUInt8(0x08);
    buffer.writeInt32LE(days);
    buffer.writeUInt32LE(ticks);
  },

  validate: function(value): null | Temporal.PlainDateTime {
    if (value == null) {
      return null;
    }

    const dateTime = toPlainDateTime(value);
    checkRange(dateTime, MIN_DATETIME, MAX_DATETIME);
    return dateTime;
  }
};

export default DateTime;
module.exports = DateTime;
