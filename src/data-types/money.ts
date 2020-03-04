import { DataType } from '../data-type';
import MoneyN from './moneyn';

const SHIFT_LEFT_32 = (1 << 16) * (1 << 16);
const SHIFT_RIGHT_32 = 1 / SHIFT_LEFT_32;

const Money: DataType = {
  id: 0x3C,
  type: 'MONEY',
  name: 'Money',

  declaration: function() {
    return 'money';
  },

  generateTypeInfo: function() {
    return Buffer.from([MoneyN.id, 0x08]);
  },

  *generateParameterData(parameter, options) {
    if (parameter.value != null) {
      const buffer = Buffer.alloc(1);
      buffer.writeUInt8(8, 0);
      yield buffer;

      const value = parameter.value * 10000;

      const buffer2 = Buffer.alloc(4);
      buffer2.writeInt32LE(Math.floor(value * SHIFT_RIGHT_32), 0);
      yield buffer2;

      const buffer3 = Buffer.alloc(4);
      buffer3.writeInt32LE(value & -1, 0);
      yield buffer3;

    } else {
      yield Buffer.from([0x00]);
    }
  },

  validate: function(value): number | null | TypeError {
    if (value == null) {
      return null;
    }
    value = parseFloat(value);
    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }
    // money： -922337203685477.5808 to 922337203685477.5807
    // in javascript -922337203685477.5808 === -922337203685477.6
    //                922337203685477.5807 === 922337203685477.6
    // javascript number doesn't have enough precision.
    if (!(value >= -922337203685477.5808 + 0.1 && value <= 922337203685477.5807 - 0.1)) {
      return new TypeError('Value must be between -922337203685477.5808 and 922337203685477.5807.');
    }

    return value;
  }
};

export default Money;
module.exports = Money;
