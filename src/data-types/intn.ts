import { DataType } from '../data-type';

const IntN: DataType = {
  id: 0x26,
  type: 'INTN',
  name: 'IntN',

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

export default IntN;
module.exports = IntN;
