const DateTimeN = require('./datetimen');
const EPOCH_DATE = DateTimeN.EPOCH_DATE;
const UTC_EPOCH_DATE = DateTimeN.UTC_EPOCH_DATE;

module.exports = {
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

  writeParameterData: function(buffer, parameter, options) {
    if (parameter.value != null) {
      let days, dstDiff, minutes;
      const _date = new Date(parameter.value);
      if (options.useUTC) {
        days = Math.floor((_date.getTime() - UTC_EPOCH_DATE.getTime()) / (1000 * 60 * 60 * 24));
        minutes = (_date.getUTCHours() * 60) + _date.getUTCMinutes();
      } else {
        dstDiff = -(_date.getTimezoneOffset() - EPOCH_DATE.getTimezoneOffset()) * 60 * 1000;
        days = Math.floor((_date.getTime() - EPOCH_DATE.getTime() + dstDiff) / (1000 * 60 * 60 * 24));
        minutes = (_date.getHours() * 60) + _date.getMinutes();
      }

      buffer.writeUInt8(4);
      buffer.writeUInt16LE(days);

      buffer.writeUInt16LE(minutes);
    } else {
      buffer.writeUInt8(0);
    }
  },
  validate: DateTimeN.validate
};
