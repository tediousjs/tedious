import { type DataType } from '../data-type';

const BitN: DataType = {
  id: 0x68,
  type: 'BITN',
  name: 'BitN',

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

export default BitN;
module.exports = BitN;
