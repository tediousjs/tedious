import { DataType } from '../data-type';

const Time: DataType = {
  id: 0x29,
  type: 'TIMEN',
  name: 'Time',

  declaration: function(parameter) {
    return 'time(' + (this.resolveScale!(parameter)) + ')';
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
    buffer.writeUInt8(parameter.scale!);
  },

  writeParameterData: function(buffer, parameter, options, cb) {

    if (parameter.value != null) {
      const time = new Date(+parameter.value);

      let timestamp;
      if (options.useUTC) {
        timestamp = ((time.getUTCHours() * 60 + time.getUTCMinutes()) * 60 + time.getUTCSeconds()) * 1000 + time.getUTCMilliseconds();
      } else {
        timestamp = ((time.getHours() * 60 + time.getMinutes()) * 60 + time.getSeconds()) * 1000 + time.getMilliseconds();
      }

      timestamp = timestamp * Math.pow(10, parameter.scale! - 3);
      timestamp += (parameter.value.nanosecondDelta != null ? parameter.value.nanosecondDelta : 0) * Math.pow(10, parameter.scale!);
      timestamp = Math.round(timestamp);

      switch (parameter.scale) {
        case 0:
        case 1:
        case 2:
          buffer.writeUInt8(3);
          buffer.writeUInt24LE(timestamp);
          break;
        case 3:
        case 4:
          buffer.writeUInt8(4);
          buffer.writeUInt32LE(timestamp);
          break;
        case 5:
        case 6:
        case 7:
          buffer.writeUInt8(5);
          buffer.writeUInt40LE(timestamp);
      }
    } else {
      buffer.writeUInt8(0);
    }
    cb();
  },

  validate: function(value): null| number| TypeError | Date {
    if (value == null) {
      return null;
    }
    if (value instanceof Date) {
      return value;
    }
    value = Date.parse(value);
    if (isNaN(value)) {
      return new TypeError('Invalid time.');
    }
    return value;
  }
};


export default Time;
module.exports = Time;
