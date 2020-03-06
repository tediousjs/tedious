import { DataType } from '../data-type';
import IntN from './intn';

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

  *generateParameterData(parameter, options) {
    if (parameter.value != null) {
      const buffer = Buffer.alloc(1);
      buffer.writeUInt8(4, 0);
      yield buffer;

      const buffer2 = Buffer.alloc(4);
      buffer2.writeInt32LE(Number(parameter.value), 0);
      yield buffer2;
    } else {
      yield Buffer.from([0x00]);
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

    if (value < -2147483648 || value > 2147483647) {
      return new TypeError('Value must be between -2147483648 and 2147483647, inclusive.');
    }

    return value | 0;
  }
};

export default Int;
module.exports = Int;
