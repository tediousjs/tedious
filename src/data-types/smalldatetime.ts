import { type DataType } from '../data-type';
import DateTimeN from './datetimen';
import { checkRange, epochDaysFromDate, EPOCH_DAYS_1900_01_01, NANOSECONDS_PER_DAY, rangeBound, toPlainDateTime, type Temporal } from './temporal';

const TYPE_INFO = Buffer.from([DateTimeN.id, 0x04]);

// `smalldatetime` has minute precision; seconds and below are truncated.
// See: https://learn.microsoft.com/en-us/sql/t-sql/data-types/smalldatetime-transact-sql
const MIN_SMALLDATETIME = rangeBound(1900, 1, 1);
const MAX_SMALLDATETIME = rangeBound(2079, 6, 6, NANOSECONDS_PER_DAY - 1);

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

  writeValue(buffer, parameter) {
    const value = parameter.value as Temporal.PlainDateTime | null;
    if (value == null) {
      buffer.writeUInt8(0x00);
      return;
    }

    buffer.writeUInt8(0x04);
    buffer.writeUInt16LE(epochDaysFromDate(value.year, value.month, value.day) - EPOCH_DAYS_1900_01_01);
    buffer.writeUInt16LE(value.hour * 60 + value.minute);
  },

  validate: function(value): null | Temporal.PlainDateTime {
    if (value == null) {
      return null;
    }

    const dateTime = toPlainDateTime(value);
    checkRange(dateTime, MIN_SMALLDATETIME, MAX_SMALLDATETIME);
    return dateTime;
  }
};

export default SmallDateTime;
module.exports = SmallDateTime;
