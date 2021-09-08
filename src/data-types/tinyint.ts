import { DataType } from '../data-type';
import IntN from './intn';

const DATA_LENGTH = Buffer.from([0x01]);
const NULL_LENGTH = Buffer.from([0x00]);

const TinyInt: DataType = {
  id: 0x30,
  type: 'INT1',
  name: 'TinyInt',

  declaration: function() {
    return 'tinyint';
  },

  generateTypeInfo() {
    return Buffer.from([IntN.id, 0x01]);
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

    const buffer = Buffer.alloc(1);
    buffer.writeUInt8(Number(parameter.value), 0);
    yield buffer;
  },

  toBuffer: function(parameter) {
    const value = parameter.value;

    if (value != null) {
      const val = value as number;
      const result = Buffer.alloc(8);
      result.writeInt8(val, 0);

      return result;
    } else {
      return Buffer.from([]);
    }
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

    if (value < 0 || value > 255) {
      throw new TypeError('Value must be between 0 and 255, inclusive.');
    }

    return value | 0;
  }
};

export default TinyInt;
module.exports = TinyInt;
