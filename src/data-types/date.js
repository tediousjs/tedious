const DateTimeN = require('./datetimen');
const YEAR_ONE = DateTimeN.YEAR_ONE;
const UTC_YEAR_ONE = DateTimeN.UTC_YEAR_ONE;

module.exports = {
  id: 0x28,
  type: 'DATEN',
  name: 'Date',
  dataLengthLength: 1,
  fixedDataLength: 3,

  declaration: function() {
    return 'date';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(this.id);
  },

  writeParameterData: function(buffer, parameter, options) {
    if (parameter.value != null) {
      const _date = new Date(parameter.value);
      buffer.writeUInt8(3);
      if (options.useUTC) {
        buffer.writeUInt24LE(Math.floor((+_date - UTC_YEAR_ONE) / 86400000));
      } else {
        const dstDiff = -(_date.getTimezoneOffset() - YEAR_ONE.getTimezoneOffset()) * 60 * 1000;
        buffer.writeUInt24LE(Math.floor((+_date - YEAR_ONE + dstDiff) / 86400000));
      }
    } else {
      buffer.writeUInt8(0);
    }
  },
  validate: DateTimeN.validate
};
