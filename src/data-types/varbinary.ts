import { DataType } from '../data-type';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const NULL = (1 << 16) - 1;
const MAX = (1 << 16) - 1;

const UNKNOWN_PLP_LEN = Buffer.from([0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

const VarBinary: { maximumLength: number } & DataType = {
  id: 0xA5,
  type: 'BIGVARBIN',
  name: 'VarBinary',
  maximumLength: 8000,

  declaration: function(parameter) {
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.
    let length;
    if (parameter.length) {
      length = parameter.length;
    } else if (value != null) {
      length = value.length || 1;
    } else if (value === null && !parameter.output) {
      length = 1;
    } else {
      length = this.maximumLength;
    }

    if (length <= this.maximumLength) {
      return 'varbinary(' + length + ')';
    } else {
      return 'varbinary(max)';
    }
  },

  resolveLength: function(parameter) {
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.
    if (parameter.length != null) {
      return parameter.length;
    } else if (value != null) {
      return value.length;
    } else {
      return this.maximumLength;
    }
  },

  writeTypeInfo: function(buffer, parameter) {
    buffer.writeUInt8(this.id);
    if (parameter.length! <= this.maximumLength) {
      buffer.writeUInt16LE(this.maximumLength);
    } else {
      buffer.writeUInt16LE(MAX);
    }
  },

  writeParameterData: function(buff, parameter, options, cb) {
    buff.writeBuffer(Buffer.concat(Array.from(this.generate(parameter, options))));
    cb();
  },

  generate: function* (parameter, options) {
    if (parameter.value != null) {
      if (parameter.length! <= this.maximumLength) {
        const buffer = new WritableTrackingBuffer(0);
        buffer.writeUsVarbyte(parameter.value);
        yield buffer.data;
      } else {
        // Length of all chunks.
        // this.writeUInt64LE(length);
        // unknown seems to work better here - might revisit later.
        yield UNKNOWN_PLP_LEN;

        const length = parameter.value.length;

        // In the UNKNOWN_PLP_LEN case, the data is represented as a series of zero or more chunks.
        if (length > 0) {
          // One chunk.
          const lengthBuffer = Buffer.alloc(4);
          lengthBuffer.writeUInt32LE(length, 0);
          yield lengthBuffer;

          yield parameter.value;
        }

        // PLP_TERMINATOR (no more chunks).
        yield Buffer.alloc(4);
      }
    } else if (parameter.length! <= this.maximumLength) {
      const buffer = new WritableTrackingBuffer(2);
      buffer.writeUInt16LE(NULL);
      yield buffer.data;
    } else {
      const buffer = new WritableTrackingBuffer(8);
      buffer.writeUInt32LE(0xFFFFFFFF);
      buffer.writeUInt32LE(0xFFFFFFFF);
      yield buffer.data;
    }
  },

  validate: function(value): Buffer | null | TypeError {
    if (value == null) {
      return null;
    }
    if (!Buffer.isBuffer(value)) {
      return new TypeError('Invalid buffer.');
    }
    return value;
  }
};

export default VarBinary;
module.exports = VarBinary;
