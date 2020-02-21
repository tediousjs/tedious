import { DataType } from '../data-type';
import IntN from './intn';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const Int: DataType = {
  id: 0x38,
  type: 'INT4',
  name: 'Int',

  declaration: function() {
    return 'int';
  },

  writeTypeInfo: function(buffer) {
    buffer.writeUInt8(IntN.id);
    buffer.writeUInt8(4);
  },

  writeParameterData: function(buff, parameter, options, cb) {
    buff.writeBuffer(Buffer.concat(Array.from(this.generate(parameter, options))));
    cb();
  },

  generate: function*(parameter, options) {
    if (parameter.value != null) {
      const buffer = new WritableTrackingBuffer(5);
      buffer.writeUInt8(4);
      buffer.writeInt32LE(Number(parameter.value));
      yield buffer.data;
    } else {
      const buffer = new WritableTrackingBuffer(1);
      buffer.writeUInt8(0);
      yield buffer.data;
    }
  },

  toBuffer: function(parameter) {
    if (parameter.value != null) {
      // Always Encrypted length must be normalized to 8 bytes for int
      const buffer = Buffer.alloc(8);
      buffer.writeInt32LE(Number(parameter.value), 0);
      return buffer;
    }
  },

  validate: function(value): number | null | TypeError {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'number') {
      value = Number(value);
    }

    if (isNaN(value)) {
      return new TypeError('Invalid number.');
    }

    if (value < -2147483648 || value > 2147483647) {
      return new TypeError('Value must be between -2147483648 and 2147483647, inclusive.');
    }

    return value | 0;
  }
};

export default Int;
module.exports = Int;
