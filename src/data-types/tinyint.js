const IntN = require('./intn');

module.exports = {
  id: 0x30,
  type: 'INT1',
  name: 'TinyInt',

  declaration: function() {
    return 'tinyint';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(IntN.id);
    buffer.writeUInt8(1);
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      buffer.writeUInt8(1);
      buffer.writeUInt8(Math.round(parameter.value));
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    value = Math.round(value);
    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }
    if (value < 0 || value > 255) {
      return new TypeError('Value must be between 0 and 255.');
    }
    return value;
  }
};
