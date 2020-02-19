import { DataType } from '../data-type';
import float from './float';

const FloatN: DataType = {
  id: 0x6D,
  type: 'FLTN',
  name: 'FloatN',

  getDataType: function(dataLength: number) {
    return (dataLength === 4 || dataLength === 8) ? float : this;
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

export default FloatN;
module.exports = FloatN;
