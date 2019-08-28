const YEAR_ONE = new Date(2000, 0, -730118);
const UTC_YEAR_ONE = Date.UTC(2000, 0, -730118);

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

  writeParameterData: function(buffer, parameter, options, cb) {
    if (parameter.value != null) {
      buffer.writeUInt8(3);
      if (options.useUTC) {
        buffer.writeUInt24LE(Math.floor((+parameter.value - UTC_YEAR_ONE) / 86400000));
      } else {
        const dstDiff = -(parameter.value.getTimezoneOffset() - YEAR_ONE.getTimezoneOffset()) * 60 * 1000;
        buffer.writeUInt24LE(Math.floor((+parameter.value - YEAR_ONE + dstDiff) / 86400000));
      }
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
