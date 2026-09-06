import { type DataType } from '../data-type';
import IntN from './intn';

const TYPE_INFO = Buffer.from([IntN.id, 0x02]);

const SmallInt: DataType = {
  id: 0x34,
  type: 'INT2',
  name: 'SmallInt',

  declaration: function() {
    return 'smallint';
  },

  writeTypeInfo(buffer) {
    buffer.writeBuffer(TYPE_INFO);
  },

  writeValue(buffer, parameter) {
    const value = parameter.value as number | null;
    if (value == null) {
      buffer.writeUInt8(0x00);
      return;
    }

    buffer.writeUInt8(0x02);
    buffer.writeInt16LE(value);
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
