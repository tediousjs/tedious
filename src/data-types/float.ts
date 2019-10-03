import { DataType } from '../data-type';

const FloatN = require('./floatn');

const Float: DataType = {
  id: 0x3E,
  type: 'FLT8',
  name: 'Float',

  declaration: function() {
    return 'float';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(FloatN.id);
    buffer.writeUInt8(8);
  },

  writeParameterData: function(buffer, parameter, options, cb) {
    if (parameter.value != null) {
      buffer.writeUInt8(8);
      buffer.writeDoubleLE(parseFloat(parameter.value));
    } else {
      buffer.writeUInt8(0);
    }
    cb();
  },

  validate: function(value): null | TypeError | Buffer {
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

export default Float;
module.exports = Float;
