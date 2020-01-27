import { DataType } from '../data-type';

const Null: DataType = {
  id: 0x1F,
  type: 'NULL',
  name: 'Null',

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

export default Null;
module.exports = Null;
