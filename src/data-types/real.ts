import { DataType } from '../data-type';
import FloatN from './floatn';

const Real: DataType = {
  id: 0x3B,
  type: 'FLT4',
  name: 'Real',

  declaration: function() {
    return 'real';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(FloatN.id);
    buffer.writeUInt8(4);
  },

  writeParameterData: function(buffer, parameter, options, cb) {
    if (parameter.value != null) {
      buffer.writeUInt8(4);
      buffer.writeFloatLE(parseFloat(parameter.value));
    } else {
      buffer.writeUInt8(0);
    }
    cb();
  },

  toBuffer: function(parameter) {
    const value = parameter.value;

    if (value != null) {
      const val = parseFloat(value as string);
      const result = Buffer.alloc(4);
      result.writeFloatLE(val, 0);

      return result;
    } else {
      return Buffer.from([]);
    }
  },

  validate: function(value): null| number |TypeError {
    if (value == null) {
      return null;
    }
    value = parseFloat(value);
    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }
    return value;
  }
};

export default Real;
module.exports = Real;
