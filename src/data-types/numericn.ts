import { DataType } from '../data-type';
import numeric from './numeric';

const NumericN: DataType = {
  id: 0x6C,
  type: 'NUMERICN',
  name: 'NumericN',

  getDataType: function(dataLength) {
    return (dataLength === 17) ? numeric : this;
  },

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
