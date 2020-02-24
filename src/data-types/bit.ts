import { DataType } from '../data-type';
import BitN from './bitn';

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

  *generateParameterData(parameter, options) {
    if (typeof parameter.value === 'undefined' || parameter.value === null) {
      const buffer = Buffer.alloc(1);
      buffer.writeUInt8(0, 0);
      yield buffer;
    } else {
      const buffer = Buffer.alloc(2);
      buffer.writeUInt8(1, 0);
      buffer.writeUInt8(parameter.value ? 1 : 0, 1);
      yield buffer;
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
