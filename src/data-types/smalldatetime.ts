import { type DataType } from '../data-type';
import DateTimeN from './datetimen';

const EPOCH_DATE = new Date(1900, 0, 1);
const UTC_EPOCH_DATE = new Date(Date.UTC(1900, 0, 1));

const MIN_DATE = new Date(1900, 1, 1);
const MAX_DATE = new Date(2079, 5, 6, 23, 59, 59, 0);

const DATA_LENGTH = Buffer.from([0x04]);
const NULL_LENGTH = Buffer.from([0x00]);

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

    const buffer = Buffer.alloc(4);

    let days: number, dstDiff: number, minutes: number;
    if (options.useUTC) {
      days = Math.floor((parameter.value.getTime() - UTC_EPOCH_DATE.getTime()) / (1000 * 60 * 60 * 24));
      minutes = (parameter.value.getUTCHours() * 60) + parameter.value.getUTCMinutes();
    } else {
      dstDiff = -(parameter.value.getTimezoneOffset() - EPOCH_DATE.getTimezoneOffset()) * 60 * 1000;
      days = Math.floor((parameter.value.getTime() - EPOCH_DATE.getTime() + dstDiff) / (1000 * 60 * 60 * 24));
      minutes = (parameter.value.getHours() * 60) + parameter.value.getMinutes();
    }

    buffer.writeUInt16LE(days, 0);
    buffer.writeUInt16LE(minutes, 2);

    yield buffer;
  },

  validate: function(value, collation, options): null | Date {
    if (value == null) {
      return null;
    }

    if (!(value instanceof Date)) {
      value = new Date(Date.parse(value));
    }

    value = value as Date;

    if (options && options.useUTC) {
      value = new Date(value.toUTCString());
    }

    if (value < MIN_DATE || value > MAX_DATE) {
      throw new TypeError('Out of range.');
    }

    if (isNaN(value)) {
      throw new TypeError('Invalid date.');
    }

    return value;
  }
};

export default SmallDateTime;
module.exports = SmallDateTime;
