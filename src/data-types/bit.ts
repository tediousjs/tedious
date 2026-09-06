import { type DataType } from '../data-type';
import BitN from './bitn';

const DATA_LENGTH = Buffer.from([0x01]);
const NULL_LENGTH = Buffer.from([0x00]);
const TYPE_INFO = Buffer.from([BitN.id, 0x01]);

const Bit: DataType = {
  id: 0x32,
  type: 'BIT',
  name: 'Bit',

  declaration: function() {
    return 'bit';
  },

  generateTypeInfo() {
    return Buffer.from([BitN.id, 0x01]);
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

    yield parameter.value ? Buffer.from([0x01]) : Buffer.from([0x00]);
  },

  writeTypeInfo(buffer) {
    buffer.writeBuffer(TYPE_INFO);
  },

  writeValue(buffer, parameter) {
    const value = parameter.value as boolean | null;
    if (value == null) {
      buffer.writeUInt8(0x00);
      return;
    }

    buffer.writeUInt8(0x01);
    buffer.writeUInt8(value ? 0x01 : 0x00);
  },

  validate: function(value): null | boolean {
    if (value == null) {
      return null;
    }
    if (value) {
      return true;
    } else {
      return false;
    }
  }
};

export default Bit;
module.exports = Bit;
