import { DataType } from '../data-type';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';
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

  toBuffer: function(parameter) {
    const value = parameter.value;

    if (value != null) {
      const val = parseFloat(value as string) * 10000;

      const buffer = new WritableTrackingBuffer(8);
      buffer.writeMoney(val);

      return buffer.data;
    } else {
      return Buffer.from([]);
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
    return value;
  }
};

export default Money;
module.exports = Money;
