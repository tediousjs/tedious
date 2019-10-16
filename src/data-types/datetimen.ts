import { DataType } from '../data-type';

const DateTimeN: DataType = {
  id: 0x6F,
  type: 'DATETIMN',
  name: 'DateTimeN',

  getDataType: function(dataLength: number) {
    const smalldatetime = require('./smalldatetime');
    const datetime = require('./datetime');

    switch (dataLength) {
      case 4:
        return smalldatetime;

      case 8:
        return datetime;

      default: return this;
    };
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

  validate() {
    throw new Error('not implemented');
  }
};

export default DateTimeN;
module.exports = DateTimeN;
