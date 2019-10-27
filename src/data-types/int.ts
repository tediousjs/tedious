import { DataType } from '../data-type';
import IntN from './intn';

const Int: DataType = {
  id: 0x38,
  type: 'INT4',
  name: 'Int',

  declaration: function() {
    return 'int';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(IntN.id);
    buffer.writeUInt8(4);
  },

  writeParameterData: function(buffer, parameter, options, cb) {
    if (parameter.value != null) {
      buffer.writeUInt8(4);
      buffer.writeInt32LE(parseInt(parameter.value));
    } else {
      buffer.writeUInt8(0);
    }
    cb();
  },

  validate: function(value): number | null | TypeError {
    if (value == null) {
      return null;
    }
    value = parseInt(value);
    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }
    if (value < -2147483648 || value > 2147483647) {
      return new TypeError('Value must be between -2147483648 and 2147483647.');
    }
    return value;
  }
};

export default Int;
module.exports = Int;
