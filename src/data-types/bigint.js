const IntN = require('./intn');

module.exports = {
  id: 0x7F,
  type: 'INT8',
  name: 'BigInt',

  declaration: function() {
    return 'bigint';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(IntN.id);
    buffer.writeUInt8(8);
  },

  writeParameterData: function(buffer, parameter) {
    const value = parameter.value;
    if (value === null) {
      buffer.writeUInt8(0);
    } else {
      buffer.writeUInt8(8);
      buffer.writeInt64LE(value);
    }
  },

  validate(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const numberValue = typeof value === 'number' ? value : parseInt(value);
    if (!Number.isSafeInteger(numberValue)) {
      return new TypeError(`The given value could not be converted to ${this.name}`);
    }

    return numberValue;
  }
};
