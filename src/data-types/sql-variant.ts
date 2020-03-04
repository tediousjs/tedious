import { DataType } from '../data-type';

const Variant: DataType = {
  id: 0x62,
  type: 'SSVARIANTTYPE',
  name: 'Variant',

  declaration: function() {
    return 'sql_variant';
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

export default Variant;
module.exports = Variant;
