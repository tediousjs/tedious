const MoneyN = require('./moneyn');

module.exports = {
  id: 0x3C,
  type: 'MONEY',
  name: 'Money',

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

    if (!Number.isFinite(numberValue) || (typeof value === 'string' && value !== numberValue.toString()) || numberValue.toString() !== numberValue.toFixed(4)) {
      return new TypeError(`The given value could not be converted to ${this.name}`);
    }

    return numberValue;
  }
};
