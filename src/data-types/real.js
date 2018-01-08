const FloatN = require('./floatn');

module.exports = {
  id: 0x3B,
  type: 'FLT4',
  name: 'Real',

  declaration: function() {
    return 'real';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(FloatN.id);
    buffer.writeUInt8(4);
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      buffer.writeUInt8(4);
      buffer.writeFloatLE(parameter.value);
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

    if (!Number.isFinite(numberValue) || (typeof value === 'string' && value !== numberValue.toString()) || numberValue !== Math.fround(numberValue)) {
      return new TypeError(`The given value could not be converted to ${this.name}`);
    }

    return numberValue;
  }
};
