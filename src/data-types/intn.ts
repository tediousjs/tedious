import { DataType } from '../data-type';
import tinyInt from './tinyint';
import smallInt from './smallint';
import int from './int';
import bigInt from './bigint';

const IntN: DataType = {
  id: 0x26,
  type: 'INTN',
  name: 'IntN',

  getDataType: function(dataLength: number) {
    switch (dataLength) {
      case 1:
        return tinyInt;

      case 2:
        return smallInt;

      case 4:
        return int;

      case 8:
        return bigInt;

      default: return this;
    }
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

  generate() {
    throw new Error('not implemented');
  },

  validate() {
    throw new Error('not implemented');
  }
};

export default IntN;
module.exports = IntN;
