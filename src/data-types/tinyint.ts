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

  writeParameterData: function(buffer, parameter, options, cb) {
    if (parameter.value != null) {
      buffer.writeUInt8(1);
      buffer.writeUInt8(parseInt(parameter.value));
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
    if (value < 0 || value > 255) {
      return new TypeError('Value must be between 0 and 255.');
    }
    return value;
  }
};

export default TinyInt;
module.exports = TinyInt;
