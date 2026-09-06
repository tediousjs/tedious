import { type DataType } from '../data-type';

const DateTimeN: DataType = {
  id: 0x6F,
  type: 'DATETIMN',
  name: 'DateTimeN',

  declaration() {
    throw new Error('not implemented');
  },

  writeTypeInfo() {
    throw new Error('not implemented');
  },

  writeValue() {
    throw new Error('not implemented');
  },

  validate() {
    throw new Error('not implemented');
  }
};

export default DateTimeN;
module.exports = DateTimeN;
