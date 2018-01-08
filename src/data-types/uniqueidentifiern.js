const guidParser = require('../guid-parser');

module.exports = {
  id: 0x24,
  type: 'GUIDN',
  name: 'UniqueIdentifierN',
  aliases: ['UniqueIdentifier'],
  dataLengthLength: 1,

  declaration: function() {
    return 'uniqueidentifier';
  },

  resolveLength: function() {
    return 16;
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt8(0x10);
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      buffer.writeUInt8(0x10);
      buffer.writeBuffer(new Buffer(guidParser.guidToArray(parameter.value)));
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate: function(value) {
    if (value == null) {
      return null;
    }
    if (typeof value !== 'string') {
      if (typeof value.toString !== 'function') {
        return TypeError('Invalid string.');
      }
      value = value.toString();
    }
    return value;
  }
};
