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
    if (parameter.value != null) {
      // Always Encrypted length must be normalized to 8 bytes for tinyint
      const result = Buffer.alloc(8);
      result.writeUInt8(Number(parameter.value), 0);
      return result;
    }
  },

  validate: function(value): number | null | TypeError {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'number') {
      value = Number(value);
    }

    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }

    if (value < 0 || value > 255) {
      return new TypeError('Value must be between 0 and 255, inclusive.');
    }

    return value | 0;
  }
};

export default TinyInt;
module.exports = TinyInt;
