import { DataType } from '../data-type';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

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

  generateTypeInfo(parameter) {
    return Buffer.from([this.id, parameter.scale!]);
  },

<<<<<<< HEAD:src/data-types/time.js
  writeParameterData: function(buffer, parameter, options) {
    const value = parameter.value;
=======
  generateParameterData: function*(parameter, options) {
    if (parameter.value != null) {
      const buffer = new WritableTrackingBuffer(16);
      const time = parameter.value;
>>>>>>> 2fb901ae41417a1d98dcfdb584e637db9b453f5a:src/data-types/time.ts

    if (value != null) {
      let timestamp;
      if (options.useUTC) {
        timestamp = ((value.getUTCHours() * 60 + value.getUTCMinutes()) * 60 + value.getUTCSeconds()) * 1000 + value.getUTCMilliseconds();
      } else {
        timestamp = ((value.getHours() * 60 + value.getMinutes()) * 60 + value.getSeconds()) * 1000 + value.getMilliseconds();
      }

<<<<<<< HEAD:src/data-types/time.js
      timestamp = timestamp * Math.pow(10, parameter.scale - 3);
      timestamp += (value.nanosecondDelta != null ? value.nanosecondDelta : 0) * Math.pow(10, parameter.scale);
=======
      timestamp = timestamp * Math.pow(10, parameter.scale! - 3);
      timestamp += (parameter.value.nanosecondDelta != null ? parameter.value.nanosecondDelta : 0) * Math.pow(10, parameter.scale!);
>>>>>>> 2fb901ae41417a1d98dcfdb584e637db9b453f5a:src/data-types/time.ts
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

      yield buffer.data;
    } else {
      yield Buffer.from([0x00]);
    }
  },

<<<<<<< HEAD:src/data-types/time.js
  validate(value) {
    if (value === undefined || value === null) {
      return null;
    }

    let dateValue;
    if (value instanceof Date) {
      dateValue = value;
    } else {
      dateValue = new Date(Date.parse(value));
    }

    if (isNaN(dateValue)) {
      return new TypeError(`The given value could not be converted to ${this.name}`);
    }

    return dateValue;
=======
  validate: function(value): null | number | TypeError | Date {
    if (value == null) {
      return null;
    }

    if (!(value instanceof Date)) {
      value = new Date(Date.parse(value));
    }

    if (isNaN(value)) {
      return new TypeError('Invalid time.');
    }

    return value;
>>>>>>> 2fb901ae41417a1d98dcfdb584e637db9b453f5a:src/data-types/time.ts
  }
};


export default Time;
module.exports = Time;
