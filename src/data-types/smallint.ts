import { DataType } from '../data-type';
import IntN from './intn';

const DATA_LENGTH = Buffer.from([0x02]);
const NULL_LENGTH = Buffer.from([0x00]);

const SmallInt: DataType = {
  id: 0x34,
  type: 'INT2',
  name: 'SmallInt',

  declaration: function() {
    return 'smallint';
  },

  generateTypeInfo() {
    return Buffer.from([IntN.id, 0x02]);
  },

  generateParameterLength(parameter, options) {
    if (parameter.value == null) {
      return NULL_LENGTH;
    }

    return DATA_LENGTH;
  },

  * generateParameterData(parameter, options) {
    if (parameter.value == null) {
      return;
    }

    const buffer = Buffer.alloc(2);
    buffer.writeInt16LE(Number(parameter.value), 0);
    yield buffer;
  },

  validate: function(value): null | number {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'number') {
      value = Number(value);
    }

    if (isNaN(value)) {
      throw new TypeError('Invalid number.');
    }

    if (value < -32768 || value > 32767) {
      throw new TypeError('Value must be between -32768 and 32767, inclusive.');
    }

    return value | 0;
  }
};

export default SmallInt;
module.exports = SmallInt;
