import { DataType } from '../data-type';

const FloatN: DataType = {
  id: 0x6D,
  type: 'FLTN',
  name: 'FloatN',

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

export default FloatN;
module.exports = FloatN;
