import { DataType } from '../data-type';

const Variant: DataType = {
  id: 0x62,
  type: 'SSVARIANTTYPE',
  name: 'Variant',

  declaration: function() {
    return 'sql_variant';
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

export default Variant;
module.exports = Variant;
