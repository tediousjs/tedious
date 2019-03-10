const BitN = require('./bitn');

module.exports = {
  id: 0x32,
  type: 'BIT',
  name: 'Bit',

  fromBuffer(buffer, offset, length) {
    return !!buffer.readUInt8(offset);
  },

  declaration: function() {
    return 'bit';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(BitN.id);
    buffer.writeUInt8(1);
  },

  writeParameterData: function(buffer, parameter) {
    if (typeof parameter.value === 'undefined' || parameter.value === null) {
      buffer.writeUInt8(0);
    } else {
      buffer.writeUInt8(1);
      buffer.writeUInt8(parameter.value ? 1 : 0);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    if (value) {
      return true;
    } else {
      return false;
    }
  }
};
