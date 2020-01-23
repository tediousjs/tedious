import { DataType } from '../data-type';

const NText: DataType = {
  id: 0x63,
  type: 'NTEXT',
  name: 'NText',

  hasTableName: true,

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

export default NText;
module.exports = NText;
