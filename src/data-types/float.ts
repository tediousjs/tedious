import { DataType } from '../data-type';
import FloatN from './floatn';

const NULL_LENGTH = Buffer.from([0x00]);

const Float: DataType = {
  id: 0x3E,
  type: 'FLT8',
  name: 'Float',

  declaration: function() {
    return 'float';
  },

  generateTypeInfo() {
    return Buffer.from([FloatN.id, 0x08]);
  },

  generateParameterLength(parameter, options) {
    if (parameter.value == null) {
      return NULL_LENGTH;
    }

    return Buffer.from([0x08]);
  },

  * generateParameterData(parameter, options) {
    if (parameter.value == null) {
      return;
    }

    const buffer = Buffer.alloc(8);
    buffer.writeDoubleLE(parseFloat(parameter.value), 0);
    yield buffer;
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
