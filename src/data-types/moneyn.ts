import { DataType } from '../data-type';

const MoneyN: DataType = {
  id: 0x6E,
  type: 'MONEYN',
  name: 'MoneyN',

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
