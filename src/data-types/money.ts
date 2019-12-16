import { DataType } from '../data-type';
import MoneyN from './moneyn';

const Money: DataType = {
  id: 0x3C,
  type: 'MONEY',
  name: 'Money',

  declaration: function() {
    return 'money';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(MoneyN.id);
    buffer.writeUInt8(8);
  },

  writeParameterData: function(buffer, parameter, options, cb) {
    if (parameter.value != null) {
      buffer.writeUInt8(8);
      buffer.writeMoney(parameter.value * 10000);
    } else {
      buffer.writeUInt8(0);
    }
    cb();
  },

  validate: function(value): number | null | TypeError {
    if (value == null) {
      return null;
    }
    value = parseFloat(value);
    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }
    //money： -922337203685477.5808 to 922337203685477.5807
    //in javascript -922337203685477.5808 === -922337203685477.6
    //               922337203685477.5807 === 922337203685477.6
    //javascript number doesn't have enough precision.
    if (!(value >= -922337203685477.5808 + 0.1 && value <= 922337203685477.5807 - 0.1))
    {
      return new TypeError('Value must be between -922337203685477.5808 and 922337203685477.5807.');
    }

    return value;
  }
};

export default Money;
module.exports = Money;
