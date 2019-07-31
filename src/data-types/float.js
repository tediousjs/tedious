const FloatN = require('./floatn');

module.exports = {
  id: 0x3E,
  type: 'FLT8',
  name: 'Float',

  declaration: function() {
    return 'float';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(FloatN.id);
    buffer.writeUInt8(8);
  },

  writeParameterData: function(buffer, parameter, options, cb) {
    if (parameter.value != null) {
      buffer.writeUInt8(8);
      buffer.writeDoubleLE(parseFloat(parameter.value));
    } else {
      buffer.writeUInt8(0);
    }
    cb();
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    value = parseFloat(value);
    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }
    return value;
  }
};
