import { DataType } from '../data-type';
import bit from './bit';

const BitN: DataType = {
  id: 0x68,
  type: 'BITN',
  name: 'BitN',

  getDataType: function(dataLength: number) {

    return (dataLength === 1) ? bit : this;
  },

  declaration() {
    throw new Error('not implemented');
  },

  generateTypeInfo() {
    throw new Error('not implemented');
  },

  *generateParameterData() {
    throw new Error('not implemented');
  },

  validate() {
    throw new Error('not implemented');
  }
};

export default BitN;
module.exports = BitN;
