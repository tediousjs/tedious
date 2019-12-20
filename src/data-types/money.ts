import { DataType } from '../data-type';
import MoneyN from './moneyn';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

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
