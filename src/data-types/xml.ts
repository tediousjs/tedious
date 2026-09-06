import { type DataType } from '../data-type';

const XML: DataType = {
  id: 0xF1,
  type: 'XML',
  name: 'Xml',

  declaration() {
    throw new Error('not implemented');
  },

  writeTypeInfo() {
    throw new Error('not implemented');
  },

  compileWriter() {
    throw new Error('not implemented');
  },

  validate() {
    throw new Error('not implemented');
  }
};

export default XML;
module.exports = XML;
