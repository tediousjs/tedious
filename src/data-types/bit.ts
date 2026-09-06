import { type DataType } from '../data-type';
import BitN from './bitn';

const TYPE_INFO = Buffer.from([BitN.id, 0x01]);

const Bit: DataType = {
  id: 0x32,
  type: 'BIT',
  name: 'Bit',

  declaration: function() {
    return 'bit';
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
