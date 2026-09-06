import { type DataType } from '../data-type';
import IntN from './intn';

const TYPE_INFO = Buffer.from([IntN.id, 0x04]);

const Int: DataType = {
  id: 0x38,
  type: 'INT4',
  name: 'Int',

  declaration: function() {
    return 'int';
  },

  writeTypeInfo(buffer) {
    buffer.writeBuffer(TYPE_INFO);
  },

  writeValue(buffer, parameter) {
    if (parameter.value == null) {
      buffer.writeUInt8(0x00);
      return;
    }

    buffer.writeUInt8(0x04);
    buffer.writeInt32LE(Number(parameter.value));
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
