const BitN = require('./bitn');

module.exports = {
  id: 0x32,
  type: 'BIT',
  name: 'Bit',

  declaration: function() {
    return 'bit';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(BitN.id);
    buffer.writeUInt8(1);
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value === null) {
      buffer.writeUInt8(0);
    } else {
      buffer.writeUInt8(1);
      buffer.writeUInt8(parameter.value ? 1 : 0);
    }
  },

  validate(value) {
    if (value === undefined || value === null) {
      return null;
    }

    return !!value;
  }
};
