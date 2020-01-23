import { DataType } from '../data-type';

const UDT: DataType = {
  id: 0xF0,
  type: 'UDTTYPE',
  name: 'UDT',

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

export default UDT;
module.exports = UDT;
