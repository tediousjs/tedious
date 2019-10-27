import { DataType } from '../data-type';
import DateTimeN from './datetimen';

const EPOCH_DATE = new Date(1900, 0, 1);
const UTC_EPOCH_DATE = new Date(Date.UTC(1900, 0, 1));

const SmallDateTime: DataType = {
  id: 0x3A,
  type: 'DATETIM4',
  name: 'SmallDateTime',

  declaration: function() {
    return 'smalldatetime';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(DateTimeN.id);
    buffer.writeUInt8(4);
  },

  writeParameterData: function(buffer, parameter, options, cb) {
    if (parameter.value != null) {
      let days, dstDiff, minutes;
      if (options.useUTC) {
        days = Math.floor((parameter.value.getTime() - UTC_EPOCH_DATE.getTime()) / (1000 * 60 * 60 * 24));
        minutes = (parameter.value.getUTCHours() * 60) + parameter.value.getUTCMinutes();
      } else {
        dstDiff = -(parameter.value.getTimezoneOffset() - EPOCH_DATE.getTimezoneOffset()) * 60 * 1000;
        days = Math.floor((parameter.value.getTime() - EPOCH_DATE.getTime() + dstDiff) / (1000 * 60 * 60 * 24));
        minutes = (parameter.value.getHours() * 60) + parameter.value.getMinutes();
      }

      buffer.writeUInt8(4);
      buffer.writeUInt16LE(days);

      buffer.writeUInt16LE(minutes);
    } else {
      buffer.writeUInt8(0);
    }
    cb();
  },

  validate: function(value): null | Date| TypeError {
    if (value == null) {
      return null;
    }

    if (!(value instanceof Date)) {
      value = Date.parse(value);
    }

    if (isNaN(value)) {
      return new TypeError('Invalid date.');
    }

    return value;
  }
};

export default SmallDateTime;
module.exports = SmallDateTime;
