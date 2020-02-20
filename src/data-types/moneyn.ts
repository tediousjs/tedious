import { DataType } from '../data-type';
import smallmoney from './smallmoney';
import money from './money';

const MoneyN: DataType = {
  id: 0x6E,
  type: 'MONEYN',
  name: 'MoneyN',

  getDataType: function(dataLength: number) {
    switch (dataLength) {
      case 4:
        return smallmoney;

      case 8:
        return money;

      default: return this;
    }
  },

  declaration() {
    throw new Error('not implemented');
  },

  generateTypeInfo() {
    throw new Error('not implemented');
  },

  generateParameterData() {
    throw new Error('not implemented');
  },

  validate() {
    throw new Error('not implemented');
  }
};

export default MoneyN;
module.exports = MoneyN;
