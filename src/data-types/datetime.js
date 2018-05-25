const DateTimeN = require('./datetimen');

const EPOCH_DATE = DateTimeN.EPOCH_DATE;
const UTC_EPOCH_DATE = DateTimeN.UTC_EPOCH_DATE;

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

  writeParameterData: function(buffer, parameter, options) {
    if (parameter.value != null) {
      let days, dstDiff, milliseconds, seconds, threeHundredthsOfSecond;
      const _date = new Date(parameter.value);
      if (options.useUTC) {
        days = Math.floor((_date.getTime() - UTC_EPOCH_DATE.getTime()) / (1000 * 60 * 60 * 24));
        seconds = _date.getUTCHours() * 60 * 60;
        seconds += _date.getUTCMinutes() * 60;
        seconds += _date.getUTCSeconds();
        milliseconds = (seconds * 1000) + _date.getUTCMilliseconds();
      } else {
        dstDiff = -(_date.getTimezoneOffset() - EPOCH_DATE.getTimezoneOffset()) * 60 * 1000;
        days = Math.floor((_date.getTime() - EPOCH_DATE.getTime() + dstDiff) / (1000 * 60 * 60 * 24));
        seconds = _date.getHours() * 60 * 60;
        seconds += _date.getMinutes() * 60;
        seconds += _date.getSeconds();
        milliseconds = (seconds * 1000) + _date.getMilliseconds();
      }

      threeHundredthsOfSecond = milliseconds / (3 + (1 / 3));
      threeHundredthsOfSecond = Math.round(threeHundredthsOfSecond);

      buffer.writeUInt8(8);
      buffer.writeInt32LE(days);

      buffer.writeUInt32LE(threeHundredthsOfSecond);
    } else {
      buffer.writeUInt8(0);
    }
  },
  validate: DateTimeN.validate
};
