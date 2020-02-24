import { DataType } from '../data-type';
import IntN from './intn';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const BigInt: DataType = {
  id: 0x7F,
  type: 'INT8',
  name: 'BigInt',

  declaration: function() {
    return 'bigint';
  },

  generateTypeInfo() {
    return Buffer.from([IntN.id, 0x08]);
  },

  *generateParameterData(parameter, options) {
    if (parameter.value != null) {
      const buffer = new WritableTrackingBuffer(9);
      buffer.writeUInt8(8);
      buffer.writeInt64LE(Number(parameter.value));
      yield buffer.data;
    } else {
      yield Buffer.from([0x00]);
    }
  },

  validate: function(value): null | number | TypeError {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'number') {
      value = Number(value);
    }

    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }

    if (value < Number.MIN_SAFE_INTEGER || value > Number.MAX_SAFE_INTEGER) {
      return new TypeError(`Value must be between ${Number.MIN_SAFE_INTEGER} and ${Number.MAX_SAFE_INTEGER}, inclusive.  For smaller or bigger numbers, use VarChar type.`);
    }

    return value;
  }
};

export default BigInt;
module.exports = BigInt;
