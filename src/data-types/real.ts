import { DataType } from '../data-type';
import FloatN from './floatn';

const Real: DataType = {
  id: 0x3B,
  type: 'FLT4',
  name: 'Real',

  declaration: function() {
    return 'real';
  },

  generateTypeInfo() {
    return Buffer.from([FloatN.id, 0x04]);
  },

  *generateParameterData(parameter, options) {
    if (parameter.value != null) {
      const buffer = Buffer.alloc(5);
      let offset = 0;
      offset = buffer.writeUInt8(4, offset);
      buffer.writeFloatLE(parseFloat(parameter.value), offset);
      yield buffer;
    } else {
      yield Buffer.from([0x00]);
    }
  },

  validate: function(value): null | number | TypeError {
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
