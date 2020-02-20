import { DataType } from '../data-type';
import smalldatetime from './smalldatetime';
import datetime from './datetime';

const DateTimeN: DataType = {
  id: 0x6F,
  type: 'DATETIMN',
  name: 'DateTimeN',

  getDataType: function(dataLength: number) {
    switch (dataLength) {
      case 4:
        return smalldatetime;

      case 8:
        return datetime;

      default: return this;
    }
  },

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

export default DateTimeN;
module.exports = DateTimeN;
