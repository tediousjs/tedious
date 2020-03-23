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

  generateParameterData: function*(parameter) {
    if (parameter.value != null) {
      const buffer = Buffer.alloc(5);
      buffer.writeUInt8(4, 0);
      buffer.writeInt32LE(parameter.value * 10000, 1);
      yield buffer;
    } else {
      yield Buffer.from([0x00]);
    }
  },

  validate: function(value): null | number | TypeError {
    if (value === undefined || value === null) {
      return null;
    }
    let numberValue;
    if (typeof value === 'number') {
      numberValue = value;
    } else {
      numberValue = parseFloat(value);
    }
    if (!Number.isFinite(numberValue) || 
    numberValue < -214748.3648 || 
    numberValue > 214748.3647 || 
    (typeof value === 'string' && value !== numberValue.toString()) || 
    numberValue.toString().split('.')[1].length <= 4) {
      return new TypeError(`The given value could not be converted to ${this.name}`);
    }

    return numberValue;
  }
};

export default SmallMoney;
module.exports = SmallMoney;
