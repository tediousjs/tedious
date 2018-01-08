const IntN = require('./intn');

module.exports = {
  id: 0x34,
  type: 'INT2',
  name: 'SmallInt',

  declaration: function() {
    return 'smallint';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(IntN.id);
    buffer.writeUInt8(2);
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      buffer.writeUInt8(2);
      buffer.writeInt16LE(parameter.value);
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const numberValue = typeof value === 'number' ? value : parseInt(value);
    if (!Number.isSafeInteger(numberValue) || value < -32768 || value > 32767) {
      return new TypeError(`The given value could not be converted to ${this.name}`);
    }

    return numberValue;
  }
};
