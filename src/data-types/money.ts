import { type DataType } from '../data-type';
import MoneyN from './moneyn';
import { scaleDecimalString } from './decimal-common';

// The range of `money` in ten-thousandths: a signed 64-bit integer.
const MIN_MONEY = -(2n ** 63n);
const MAX_MONEY = 2n ** 63n - 1n;

const SHIFT_LEFT_32 = (1 << 16) * (1 << 16);
const SHIFT_RIGHT_32 = 1 / SHIFT_LEFT_32;

const TYPE_INFO = Buffer.from([MoneyN.id, 0x08]);

const Money: DataType = {
  id: 0x3C,
  type: 'MONEY',
  name: 'Money',

  declaration: function() {
    return 'money';
  },

  writeTypeInfo(buffer) {
    buffer.writeBuffer(TYPE_INFO);
  },

  writeValue(buffer, parameter) {
    const value = parameter.value as number | string | null;
    if (value == null) {
      buffer.writeUInt8(0x00);
      return;
    }

    buffer.writeUInt8(0x08);

    // The value in ten-thousandths, as a high and a low 32-bit half.
    if (typeof value === 'string') {
      const scaled = scaleDecimalString(value, 4)!;
      buffer.writeInt32LE(Number(scaled >> 32n));
      buffer.writeUInt32LE(Number(scaled & 0xFFFFFFFFn));
      return;
    }

    const scaled = value * 10000;
    buffer.writeInt32LE(Math.floor(scaled * SHIFT_RIGHT_32));
    buffer.writeInt32LE(scaled & -1);
  },

  validate: function(value): number | string | null {
    if (value == null) {
      return null;
    }
    // A decimal string is checked and kept, without its surrounding
    // whitespace, to be written exactly.
    if (typeof value === 'string') {
      const scaled = scaleDecimalString(value, 4);
      if (scaled !== undefined) {
        if (scaled < MIN_MONEY || scaled > MAX_MONEY) {
          throw new TypeError('Value must be between -922337203685477.5808 and 922337203685477.5807, inclusive.');
        }
        return value.trim();
      }
    }
    value = parseFloat(value);
    if (isNaN(value)) {
      throw new TypeError('Invalid number.');
    }
    // money： -922337203685477.5808 to 922337203685477.5807
    // in javascript -922337203685477.5808 === -922337203685477.6
    //                922337203685477.5807 === 922337203685477.6
    // javascript number doesn't have enough precision.
    if (value < -922337203685477.6 || value > 922337203685477.6) {
      throw new TypeError('Value must be between -922337203685477.5808 and 922337203685477.5807, inclusive.');
    }

    return value;
  }
};

export default Money;
module.exports = Money;
