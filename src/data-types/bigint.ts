import { type DataType } from '../data-type';
import IntN from './intn';

const TYPE_INFO = Buffer.from([IntN.id, 0x08]);
const MAX_SAFE_BIGINT = 9223372036854775807n;
const MIN_SAFE_BIGINT = -9223372036854775808n;

const BigInt: DataType = {
  id: 0x7F,
  type: 'INT8',
  name: 'BigInt',

  declaration: function() {
    return 'bigint';
  },

  writeTypeInfo(buffer) {
    buffer.writeBuffer(TYPE_INFO);
  },

  compileWriter() {
    return (buffer, raw) => {
      const value = BigInt.validate(raw, undefined) as bigint | null;
      if (value == null) {
        buffer.writeUInt8(0x00);
        return;
      }

      buffer.writeUInt8(0x08);
      buffer.writeBigInt64LE(value);
    };
  },

  validate: function(value): null | bigint {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'bigint') {
      value = globalThis.BigInt(value);
    }

    if (value < MIN_SAFE_BIGINT || value > MAX_SAFE_BIGINT) {
      throw new TypeError(`Value must be between ${MIN_SAFE_BIGINT} and ${MAX_SAFE_BIGINT}, inclusive.`);
    }

    return value;
  }
};

export default BigInt;
module.exports = BigInt;
