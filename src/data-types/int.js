const IntN = require('./intn');

module.exports = {
  id: 0x38,
  type: 'INT4',
  name: 'Int',

  declaration: function() {
    return 'int';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(IntN.id);
    buffer.writeUInt8(4);
  },

  writeParameterData: function(buffer, parameter) {
    const value = parameter.value;
    if (value === null) {
      buffer.writeUInt8(0);
    } else {
      buffer.writeUInt8(4);
      buffer.writeInt32LE(value);
    }
  },

  validate(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const numberValue = typeof value === 'number' ? value : parseInt(value);
    if (!Number.isSafeInteger(numberValue) || value < -2147483648 || value > 2147483647) {
      return new TypeError(`The given value could not be converted to ${this.name}`);
    }

    return numberValue;
  }
};
