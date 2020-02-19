import { DataType } from '../data-type';
import { ChronoUnit, LocalDate } from '@js-joda/core';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const EPOCH_DATE = LocalDate.ofYearDay(1, 1);

const DateTime2: DataType & { resolveScale: NonNullable<DataType['resolveScale']> } = {
  id: 0x2A,
  type: 'DATETIME2N',
  name: 'DateTime2',

  declaration: function(parameter) {
    return 'datetime2(' + (this.resolveScale(parameter)) + ')';
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

  writeParameterData: function(buff, parameter, options, cb) {
    buff.writeBuffer(Buffer.concat(Array.from(this.generate(parameter, options))));
    cb();
  },

  generate: function* (parameter, options) {
    const value = parameter.value;
    let scale = parameter.scale;

    if (value != null) {
      const buffer = new WritableTrackingBuffer(16);
      scale = scale!;

      let timestamp;
      if (options.useUTC) {
        timestamp = ((value.getUTCHours() * 60 + value.getUTCMinutes()) * 60 + value.getUTCSeconds()) * 1000 + value.getUTCMilliseconds();
      } else {
        timestamp = ((value.getHours() * 60 + value.getMinutes()) * 60 + value.getSeconds()) * 1000 + value.getMilliseconds();
      }
      timestamp = timestamp * Math.pow(10, scale - 3);
      timestamp += (value.nanosecondDelta != null ? value.nanosecondDelta : 0) * Math.pow(10, scale);
      timestamp = Math.round(timestamp);

      switch (scale) {
        case 0:
        case 1:
        case 2:
          buffer.writeUInt8(6);
          buffer.writeUInt24LE(timestamp);
          break;
        case 3:
        case 4:
          buffer.writeUInt8(7);
          buffer.writeUInt32LE(timestamp);
          break;
        case 5:
        case 6:
        case 7:
          buffer.writeUInt8(8);
          buffer.writeUInt40LE(timestamp);
      }

      let date;
      if (options.useUTC) {
        date = LocalDate.of(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
      } else {
        date = LocalDate.of(value.getFullYear(), value.getMonth() + 1, value.getDate());
      }

      const days = EPOCH_DATE.until(date, ChronoUnit.DAYS);
      buffer.writeUInt24LE(days);
      yield buffer.data;
    } else {
      const buffer = new WritableTrackingBuffer(1);
      buffer.writeUInt8(0);
      yield buffer.data;
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

export default DateTime2;
module.exports = DateTime2;
