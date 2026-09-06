import { type DataType } from '../data-type';
import MoneyN from './moneyn';

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

  compileWriter() {
    return (buffer, raw) => {
      const value = SmallMoney.validate(raw, undefined) as number | null;
      if (value == null) {
        buffer.writeUInt8(0x00);
        return;
      }

      buffer.writeUInt8(0x04);
      buffer.writeInt32LE(value * 10000);
    };
  },

  validate: function(value): null | number {
    if (value == null) {
      return null;
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
