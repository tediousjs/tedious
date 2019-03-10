const MoneyN = require('./moneyn');

module.exports = {
  id: 0x3C,
  type: 'MONEY',
  name: 'Money',

  fromBuffer(buffer, offset) {
    const high = buffer.readInt32LE(offset);
    const low = buffer.readUInt32LE(offset + 4);

    return (low + (0x100000000 * high)) / 10000;
  },

  declaration: function() {
    return 'money';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(MoneyN.id);
    buffer.writeUInt8(8);
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      buffer.writeUInt8(8);
      buffer.writeMoney(parameter.value * 10000);
    } else {
      buffer.writeUInt8(0);
    }
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
