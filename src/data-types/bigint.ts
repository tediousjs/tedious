import JSBI from 'jsbi';
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

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(IntN.id);
    buffer.writeUInt8(8);
  },

  writeParameterData: function(buffer, parameter, _options, cb) {
    if (parameter.value != null) {
      buffer.writeUInt8(8);
      buffer.writeInt64LE(Number(parameter.value));
    } else {
      buffer.writeUInt8(0);
    }

    cb();
  },

  toBuffer: function(parameter) {
    const value = parameter.value;

    if (value != null) {
      const val = typeof value !== 'number' ? parseInt(value as string) : value;
      const buffer = new WritableTrackingBuffer(8);
      buffer.writeBigInt64LE(JSBI.BigInt(val));
      return buffer.data;
    } else {
      return Buffer.from([]);
    }
  },

  validate: function(value) : null | number | TypeError {
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
