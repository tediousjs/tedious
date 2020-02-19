import { DataType } from '../data-type';

const MoneyN: DataType = {
  id: 0x6E,
  type: 'MONEYN',
  name: 'MoneyN',

  getDataType: function(dataLength: number) {
    const smallmoney = require('./smallmoney');
    const money = require('./money');

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

  writeTypeInfo() {
    throw new Error('not implemented');
  },

  writeParameterData() {
    throw new Error('not implemented');
  },

  generate() {
    throw new Error('not implemented');
  },

  validate() {
    throw new Error('not implemented');
  }
};

export default MoneyN;
module.exports = MoneyN;
