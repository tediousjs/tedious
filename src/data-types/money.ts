import { type DataType } from '../data-type';
import MoneyN from './moneyn';

const SHIFT_LEFT_32 = (1 << 16) * (1 << 16);
const SHIFT_RIGHT_32 = 1 / SHIFT_LEFT_32;

const NULL_LENGTH = Buffer.from([0x00]);
const DATA_LENGTH = Buffer.from([0x08]);

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

    const value = parameter.value * 10000;

    const buffer = Buffer.alloc(8);
    buffer.writeInt32LE(Math.floor(value * SHIFT_RIGHT_32), 0);
    buffer.writeInt32LE(value & -1, 4);
    yield buffer;
  },

  validate: function(value): number | null {
    if (value == null) {
      return null;
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
