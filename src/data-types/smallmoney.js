const MoneyN = require('./moneyn');

module.exports = {
  id: 0x7A,
  type: 'MONEY4',
  name: 'SmallMoney',

  declaration: function() {
    return 'smallmoney';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(MoneyN.id);
    buffer.writeUInt8(4);
  },

  writeParameterData: function(buffer, parameter) {
    if (parameter.value != null) {
      buffer.writeUInt8(4);
      buffer.writeInt32LE(parameter.value * 10000);
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

    if (!Number.isFinite(numberValue) || numberValue < -214748.3648 || numberValue > 214748.3647 || (typeof value === 'string' && value !== numberValue.toString()) || numberValue.toString() !== numberValue.toFixed(4)) {
      return new TypeError(`The given value could not be converted to ${this.name}`);
    }

    return numberValue;
  }
};
