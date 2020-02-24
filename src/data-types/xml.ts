import { DataType } from '../data-type';

const XML: DataType = {
  id: 0xF1,
  type: 'XML',
  name: 'Xml',

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

export default XML;
module.exports = XML;
