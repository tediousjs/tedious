import { DataType } from '../data-type';
import BitN from './bitn';

const DATA_LENGTH = Buffer.from([0x01]);
const NULL_LENGTH = Buffer.from([0x00]);

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

  toBuffer: function(parameter) {
    const value = parameter.value;
    if (value != null) {
      const val = value as boolean;
      const result = Buffer.alloc(8);
      result.writeInt8(val ? 1 : 0, 0);

      return result;
    } else {
      return Buffer.from([]);
    }
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
