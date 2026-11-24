import { type DataType } from '../data-type';
import DateTimeN from './datetimen';
import { epochDay } from './temporal';

const EPOCH_DATE = epochDay(1900, 1, 1);
const TYPE_INFO = Buffer.from([DateTimeN.id, 0x08]);

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

  writeValue(buffer, parameter, options) {
    const value = parameter.value as Date | null;
    if (value == null) {
      buffer.writeUInt8(0x00);
      return;
    }

    let days: number, milliseconds: number;
    if (options.useUTC) {
      days = epochDay(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()) - EPOCH_DATE;
      milliseconds = ((value.getUTCHours() * 60 + value.getUTCMinutes()) * 60 + value.getUTCSeconds()) * 1000 + value.getUTCMilliseconds();
    } else {
      days = epochDay(value.getFullYear(), value.getMonth() + 1, value.getDate()) - EPOCH_DATE;
      milliseconds = ((value.getHours() * 60 + value.getMinutes()) * 60 + value.getSeconds()) * 1000 + value.getMilliseconds();
    }

    let threeHundredthsOfSecond = Math.round(milliseconds / (3 + (1 / 3)));

    // 25920000 equals one day
    if (threeHundredthsOfSecond === 25920000) {
      days += 1;
      threeHundredthsOfSecond = 0;
    }

    buffer.writeUInt8(0x08);
    buffer.writeInt32LE(days);
    buffer.writeUInt32LE(threeHundredthsOfSecond);
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
