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

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      buffer.writeUInt8(8);
      buffer.writeDoubleLE(parameter.value);
    } else {
      buffer.writeUInt8(0);
    }
  },

  validate(value) {
    if (value === undefined || value === null) {
      return null;
    }

    let numberValue;
    if (typeof value === 'number') {
      numberValue = value;
    } else {
      numberValue = parseFloat(value);
    }

    if (!Number.isFinite(numberValue) || (typeof value === 'string' && value !== numberValue.toString())) {
      return new TypeError(`The given value could not be converted to ${this.name}`);
    }

    return numberValue;
  }
};
