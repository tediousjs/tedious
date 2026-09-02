import { type DataType } from '../data-type';
import IntN from './intn';

const NULL_LENGTH = Buffer.from([0x00]);
const DATA_LENGTH = Buffer.from([0x04]);
const TYPE_INFO = Buffer.from([IntN.id, 0x04]);

const Int: DataType = {
  id: 0x38,
  type: 'INT4',
  name: 'Int',

  declaration: function() {
    return 'int';
  },

  generateTypeInfo() {
    return Buffer.from([IntN.id, 0x04]);
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

    const buffer = Buffer.alloc(4);
    buffer.writeInt32LE(Number(parameter.value), 0);
    yield buffer;
  },

  serializeTypeInfo() {
    return TYPE_INFO;
  },

  serializeValue(parameter) {
    if (parameter.value == null) {
      return [NULL_LENGTH];
    }

    const buffer = Buffer.alloc(5);
    buffer.writeUInt8(0x04, 0);
    buffer.writeInt32LE(Number(parameter.value), 1);
    return [buffer];
  },

  validate: function(value): number | null {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'number') {
      value = Number(value);
    }

    if (isNaN(value)) {
      throw new TypeError('Invalid number.');
    }

    if (value < -2147483648 || value > 2147483647) {
      throw new TypeError('Value must be between -2147483648 and 2147483647, inclusive.');
    }

    return value | 0;
  }
};

export default Int;
module.exports = Int;
