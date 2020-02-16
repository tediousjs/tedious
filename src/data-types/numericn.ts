import { DataType } from '../data-type';

const NumericN: DataType = {
  id: 0x6C,
  type: 'NUMERICN',
  name: 'NumericN',

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

export default NumericN;
module.exports = NumericN;
