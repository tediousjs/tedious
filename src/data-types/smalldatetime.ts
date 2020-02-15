import { DataType } from '../data-type';
import DateTimeN from './datetimen';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const EPOCH_DATE = new Date(1900, 0, 1);
const UTC_EPOCH_DATE = new Date(Date.UTC(1900, 0, 1));

const SmallDateTime: DataType = {
  id: 0x3A,
  type: 'DATETIM4',
  name: 'SmallDateTime',

  declaration: function () {
    return 'smalldatetime';
  },

  writeTypeInfo: function (buffer) {
    if (buffer) {
      buffer.writeUInt8(DateTimeN.id);
      buffer.writeUInt8(4);
      return;
    }

    return Buffer.from([DateTimeN.id, 0x04]);
  },

  writeParameterData: function (buff, parameter, options, cb) {
    buff.writeBuffer(Buffer.concat(Array.from(this.generate(parameter, options))));
    cb();
  },

  generate: function* (parameter, options) {
    if (parameter.value != null) {
      const buffer = Buffer.alloc(5);
      let days, dstDiff, minutes;
      if (options.useUTC) {
        days = Math.floor((parameter.value.getTime() - UTC_EPOCH_DATE.getTime()) / (1000 * 60 * 60 * 24));
        minutes = (parameter.value.getUTCHours() * 60) + parameter.value.getUTCMinutes();
      } else {
        dstDiff = -(parameter.value.getTimezoneOffset() - EPOCH_DATE.getTimezoneOffset()) * 60 * 1000;
        days = Math.floor((parameter.value.getTime() - EPOCH_DATE.getTime() + dstDiff) / (1000 * 60 * 60 * 24));
        minutes = (parameter.value.getHours() * 60) + parameter.value.getMinutes();
      }
      let offset = 0;
      offset = buffer.writeUInt8(4, offset);
      offset = buffer.writeUInt16LE(days, offset);
      offset = buffer.writeUInt16LE(minutes, offset);
      yield buffer;
    } else {
      yield Buffer.from([0x00]);
    }
  },

  validate: function (value): null | Date | TypeError {
    if (value == null) {
      return null;
    }

    if (!(value instanceof Date)) {
      value = new Date(Date.parse(value));
    }

    if (isNaN(value)) {
      return new TypeError('Invalid date.');
    }

    return value;
  }
};

export default SmallDateTime;
module.exports = SmallDateTime;
