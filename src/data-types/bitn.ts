import { DataType } from '../data-type';

const BitN: DataType = {
  id: 0x68,
  type: 'BITN',
  name: 'BitN',

  getDataType: function(dataLength: number) {
    const bit = require('./bit');

    return (dataLength === 1) ? bit : this;
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

  validate() {
    throw new Error('not implemented');
  }
};

export default BitN;
module.exports = BitN;
