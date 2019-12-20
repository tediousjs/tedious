import { DataType } from '../data-type';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const UTC_YEAR_ONE = Date.UTC(2000, 0, -730118);

const DateTimeOffset: DataType & { resolveScale: NonNullable<DataType['resolveScale']> } = {
  id: 0x2B,
  type: 'DATETIMEOFFSETN',
  name: 'DateTimeOffset',
  declaration: function(parameter) {
    return 'datetimeoffset(' + (this.resolveScale(parameter)) + ')';
  },
  resolveScale: function(parameter) {
    if (parameter.scale != null) {
      return parameter.scale;
    } else if (parameter.value === null) {
      return 0;
    } else {
      return 7;
    }
  },
  writeTypeInfo: function(buffer, parameter) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt8(parameter.scale);
  },
  writeParameterData: function(buffer, parameter, options, cb) {
    if (parameter.value != null) {
      const time = new Date(+parameter.value);
      time.setUTCFullYear(1970);
      time.setUTCMonth(0);
      time.setUTCDate(1);

      let timestamp;
      timestamp = +time * Math.pow(10, parameter.scale! - 3);
      timestamp += (parameter.value.nanosecondDelta != null ? parameter.value.nanosecondDelta : 0) * Math.pow(10, parameter.scale!);
      timestamp = Math.round(timestamp);

      const offset = -parameter.value.getTimezoneOffset();
      switch (parameter.scale) {
        case 0:
        case 1:
        case 2:
          buffer.writeUInt8(8);
          buffer.writeUInt24LE(timestamp);
          break;
        case 3:
        case 4:
          buffer.writeUInt8(9);
          buffer.writeUInt32LE(timestamp);
          break;
        case 5:
        case 6:
        case 7:
          buffer.writeUInt8(10);
          buffer.writeUInt40LE(timestamp);
      }
      buffer.writeUInt24LE(Math.floor((+parameter.value - UTC_YEAR_ONE) / 86400000));
      buffer.writeInt16LE(offset);
    } else {
      buffer.writeUInt8(0);
    }
    cb();
  },
  toBuffer: function(parameter) {
    const value = parameter.value as Date & { nanosecondDelta?: number | null };

    if (value != null) {
      const scale = DateTimeOffset.resolveScale(parameter);

      const time = new Date(+value);
      time.setUTCFullYear(1970);
      time.setUTCMonth(0);
      time.setUTCDate(1);

      let timestamp: number;
      timestamp = +time * Math.pow(10, scale - 3);
      timestamp += (value.nanosecondDelta != null ? value.nanosecondDelta : 0) * Math.pow(10, scale);
      timestamp = Math.round(timestamp);

      const days = Math.floor((+value - UTC_YEAR_ONE) / 86400000)
      const offset = -value.getTimezoneOffset();

      // data size does not matter for encrypted datetimeoffset
      // just choose the smallest that maintains full scale (7)
      const buffer = new WritableTrackingBuffer(10);
      buffer.writeUInt40LE(timestamp);
      buffer.writeUInt24LE(days);
      buffer.writeInt16LE(offset);

      return buffer.data;
    } else {
      return Buffer.from([]);
    }
  },
  validate: function(value): null | number | TypeError {
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

export default DateTimeOffset;
module.exports = DateTimeOffset;
