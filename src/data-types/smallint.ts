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

  writeParameterData: function(buffer, parameter, _options, cb) {
    if (parameter.value != null) {
      buffer.writeUInt8(2);
      buffer.writeInt16LE(Number(parameter.value));
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
      result.writeInt16LE(val, 0);

      return result;
    } else {
      return Buffer.from([]);
    }
  },

  validate: function(value): null | number | TypeError {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'number') {
      value = Number(value);
    }

    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }

    if (value < -32768 || value > 32767) {
      return new TypeError('Value must be between -32768 and 32767, inclusive.');
    }

    return value | 0;
  }
};

export default SmallInt;
module.exports = SmallInt;
