import { DataType } from '../data-type';

const MoneyN: DataType = {
  id: 0x6E,
  type: 'MONEYN',
  name: 'MoneyN',

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
