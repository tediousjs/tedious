import { type DataType } from '../data-type';

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

  writeValue() {
    throw new Error('not implemented');
  },

  validate() {
    throw new Error('not implemented');
  }
};

export default MoneyN;
module.exports = MoneyN;
