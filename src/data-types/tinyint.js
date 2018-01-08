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
      buffer.writeUInt8(parameter.value);
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const numberValue = typeof value === 'number' ? value : parseInt(value);
    if (!Number.isSafeInteger(numberValue) || value < 0 || value > 255) {
      return new TypeError(`The given value could not be converted to ${this.name}`);
    }

    return numberValue;
  }
};
