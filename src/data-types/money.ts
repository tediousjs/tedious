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
    if (value === undefined || value === null) {
      return null;
    }

    let numberValue;
    if (typeof value === 'number') {
      numberValue = value;
    } else {
      numberValue = parseFloat(value);
    }

    if (!Number.isFinite(numberValue) ||
      (typeof value === 'string' && value !== numberValue.toString()) ||
      numberValue.toString().split('.')[1].length > 4) {
      return new TypeError(`The given value could not be converted to ${this.name}`);
    }

    return numberValue;
  }
};

export default Money;
module.exports = Money;
