import { type DataType } from '../data-type';
import MoneyN from './moneyn';
import { scaleDecimalString } from './decimal-common';

// The range of `smallmoney` in ten-thousandths: a signed 32-bit integer.
const MIN_SMALLMONEY = -(2n ** 31n);
const MAX_SMALLMONEY = 2n ** 31n - 1n;

const TYPE_INFO = Buffer.from([MoneyN.id, 0x04]);

const SmallMoney: DataType = {
  id: 0x7A,
  type: 'MONEY4',
  name: 'SmallMoney',

  declaration: function() {
    return 'smallmoney';
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

    buffer.writeUInt8(0x04);
    if (typeof value === 'string') {
      buffer.writeInt32LE(Number(scaleDecimalString(value, 4)!));
      return;
    }
    buffer.writeInt32LE(value * 10000);
  },

  validate: function(value): null | number | string {
    if (value == null) {
      return null;
    }
    // A decimal string is checked and kept, without its surrounding
    // whitespace, to be written exactly.
    if (typeof value === 'string') {
      const scaled = scaleDecimalString(value, 4);
      if (scaled !== undefined) {
        if (scaled < MIN_SMALLMONEY || scaled > MAX_SMALLMONEY) {
          throw new TypeError('Value must be between -214748.3648 and 214748.3647.');
        }
        return value.trim();
      }
    }
    value = parseFloat(value);
    if (isNaN(value)) {
      throw new TypeError('Invalid number.');
    }
    if (value < -214748.3648 || value > 214748.3647) {
      throw new TypeError('Value must be between -214748.3648 and 214748.3647.');
    }
    return value;
  }
};

export default SmallMoney;
module.exports = SmallMoney;
