import { DataType } from '../data-type';
import decimal from './decimal';

const DecimalN: DataType = {
  id: 0x6A,
  type: 'DECIMALN',
  name: 'DecimalN',

  getDataType: function(dataLength: number) {
    return (dataLength === 17) ? decimal : this;
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

export default DecimalN;
module.exports = DecimalN;
