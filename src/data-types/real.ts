import { type DataType } from '../data-type';
import FloatN from './floatn';

const NULL_LENGTH = Buffer.from([0x00]);
const TYPE_INFO = Buffer.from([FloatN.id, 0x04]);
const DATA_LENGTH = Buffer.from([0x04]);

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

  generateParameterLength(parameter, options) {
    if (parameter.value == null) {
      return NULL_LENGTH;
    }

    return DATA_LENGTH;
  },

  * generateParameterData(parameter, options) {
    if (parameter.value == null) {
      return;
    }

    const buffer = Buffer.alloc(4);
    buffer.writeFloatLE(parseFloat(parameter.value), 0);
    yield buffer;
  },

  writeTypeInfo(buffer) {
    buffer.writeBuffer(TYPE_INFO);
  },

  writeValue(buffer, parameter) {
    const value = parameter.value as number | null;
    if (value == null) {
      buffer.writeUInt8(0x00);
      return;
    }

    buffer.writeUInt8(0x04);
    buffer.writeFloatLE(value);
  },

  validate: function(value): null | number {
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

export default Real;
module.exports = Real;
