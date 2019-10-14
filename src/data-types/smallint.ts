import { DataType } from '../data-type';
import IntN from './intn';

const SmallInt: DataType = {
  id: 0x34,
  type: 'INT2',
  name: 'SmallInt',

  declaration: function() {
    return 'smallint';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(IntN.id);
    buffer.writeUInt8(2);
  },

  writeParameterData: function(buffer, parameter, options, cb) {
    if (parameter.value != null) {
      buffer.writeUInt8(2);
      buffer.writeInt16LE(parseInt(parameter.value));
    } else {
      buffer.writeUInt8(0);
    }
    cb();
  },

  validate: function(value): null | number | TypeError {
    if (value == null) {
      return null;
    }
    value = parseInt(value);
    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }
    if (value < -32768 || value > 32767) {
      return new TypeError('Value must be between -32768 and 32767.');
    }
    return value;
  }
};

export default SmallInt;
module.exports = SmallInt;
