const DateTimeN = require('./datetimen');

const EPOCH_DATE = new Date(1900, 0, 1);
const UTC_EPOCH_DATE = new Date(Date.UTC(1900, 0, 1));

module.exports = {
  id: 0x3D,
  type: 'DATETIME',
  name: 'DateTime',

  declaration: function() {
    return 'datetime';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(DateTimeN.id);
    buffer.writeUInt8(8);
  },

  writeParameterData: function(buffer, parameter, options, cb) {
    if (parameter.value != null) {
      const time = new Date(parameter.value);
      if ('Invalid Date' === time.toString()) {
        throw new TypeError('Invalid date.');
      }
      let days, dstDiff, milliseconds, seconds, threeHundredthsOfSecond;
      if (options.useUTC) {
        days = Math.floor((time.getTime() - UTC_EPOCH_DATE.getTime()) / (1000 * 60 * 60 * 24));
        seconds = time.getUTCHours() * 60 * 60;
        seconds += time.getUTCMinutes() * 60;
        seconds += time.getUTCSeconds();
        milliseconds = (seconds * 1000) + time.getUTCMilliseconds();
      } else {
        dstDiff = -(time.getTimezoneOffset() - EPOCH_DATE.getTimezoneOffset()) * 60 * 1000;
        days = Math.floor((time.getTime() - EPOCH_DATE.getTime() + dstDiff) / (1000 * 60 * 60 * 24));
        seconds = time.getHours() * 60 * 60;
        seconds += time.getMinutes() * 60;
        seconds += time.getSeconds();
        milliseconds = (seconds * 1000) + time.getMilliseconds();
      }

      threeHundredthsOfSecond = milliseconds / (3 + (1 / 3));
      threeHundredthsOfSecond = Math.round(threeHundredthsOfSecond);

      buffer.writeUInt8(8);
      buffer.writeInt32LE(days);

      buffer.writeUInt32LE(threeHundredthsOfSecond);
    } else {
      buffer.writeUInt8(0);
    }
    cb();
  },

  validate: function(value) {
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
