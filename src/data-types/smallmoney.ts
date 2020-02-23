import { DataType } from '../data-type';
import MoneyN from './moneyn';

const SmallMoney: DataType = {
  id: 0x7A,
  type: 'MONEY4',
  name: 'SmallMoney',

  declaration: function() {
    return 'smallmoney';
  },

  generateTypeInfo: function() {
    return Buffer.from([MoneyN.id, 0x04]);
  },

  generateParameterLength(parameter, options) {
    if (parameter.value == null) {
      return Buffer.from([0x00]);
    }

    return Buffer.from([0x04]);
  },

  * generateParameterData(parameter, options) {
    if (parameter.value == null) {
      return;
    }

    const buffer = Buffer.alloc(4);
    buffer.writeInt32LE(parameter.value * 10000, 0);
    yield buffer;
  },

  validate: function(value): null | number | TypeError {
    if (value == null) {
      return null;
    }
    value = parseFloat(value);
    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }
    if (value < -214748.3648 || value > 214748.3647) {
      return new TypeError('Value must be between -214748.3648 and 214748.3647.');
    }
    return value;
  }
};

export default SmallMoney;
module.exports = SmallMoney;
