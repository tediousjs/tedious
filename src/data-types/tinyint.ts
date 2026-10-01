import { type DataType } from '../data-type';
import IntN from './intn';

const TYPE_INFO = Buffer.from([IntN.id, 0x01]);

const TinyInt: DataType = {
  id: 0x30,
  type: 'INT1',
  name: 'TinyInt',

  declaration: function() {
    return 'tinyint';
  },

  writeTypeInfo(buffer) {
    buffer.writeBuffer(TYPE_INFO);
  },

  compileWriter() {
    return (buffer, raw) => {
      const value = TinyInt.validate(raw, undefined) as number | null;
      if (value == null) {
        buffer.writeUInt8(0x00);
        return;
      }

      buffer.writeUInt8(0x01);
      buffer.writeUInt8(value);
    };
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
