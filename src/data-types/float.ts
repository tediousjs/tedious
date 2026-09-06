import { type DataType } from '../data-type';
import FloatN from './floatn';

const TYPE_INFO = Buffer.from([FloatN.id, 0x08]);

const Float: DataType = {
  id: 0x3E,
  type: 'FLT8',
  name: 'Float',

  declaration: function() {
    return 'float';
  },

  writeTypeInfo(buffer) {
    buffer.writeBuffer(TYPE_INFO);
  },

  compileWriter() {
    return (buffer, raw) => {
      const value = Float.validate(raw, undefined) as number | null;
      if (value == null) {
        buffer.writeUInt8(0x00);
        return;
      }

      buffer.writeUInt8(0x08);
      buffer.writeDoubleLE(value);
    };
  },

  validate: function(value): number | null {
    if (value == null) {
      return null;
    }
    value = parseFloat(value);
    if (isNaN(value)) {
      throw new TypeError('Invalid number.');
    }
    return value;
  }
};

export default Float;
module.exports = Float;
