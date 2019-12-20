import { DataType } from '../data-type';
import IntN from './intn';

const TinyInt: DataType = {
  id: 0x30,
  type: 'INT1',
  name: 'TinyInt',

  declaration: function() {
    return 'tinyint';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(IntN.id);
    buffer.writeUInt8(1);
  },

  writeParameterData: function(buffer, parameter, _options, cb) {
    if (parameter.value != null) {
      buffer.writeUInt8(1);
      buffer.writeUInt8(Number(parameter.value));
    } else {
      buffer.writeUInt8(0);
    }

    cb();
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
