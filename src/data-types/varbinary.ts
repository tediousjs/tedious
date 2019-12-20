import { DataType, ParameterData } from '../data-type';

const NULL = (1 << 16) - 1;
const MAX = (1 << 16) - 1;

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
    if (parameter.length != null && isFinite(parameter.length)) {
      const length = parameter.length;

      if (length <= this.maximumLength) {
        buffer.writeUInt16LE(length);
      } else {
        buffer.writeUInt16LE(this.maximumLength);
      }
    } else {
      buffer.writeUInt16LE(MAX);
    }
  },

  writeParameterData: function(buffer, parameter: ParameterData<Buffer | null>, options, cb) {
    if (parameter.value != null) {
      if (parameter.length! <= this.maximumLength) {
        buffer.writeUsVarbyte(parameter.value);
      } else {
        buffer.writePLPBody(parameter.value);
      }
    } else if (parameter.length! <= this.maximumLength) {
      buffer.writeUInt16LE(NULL);
    } else {
      buffer.writeUInt32LE(0xFFFFFFFF);
      buffer.writeUInt32LE(0xFFFFFFFF);
    }
    cb();
  },

  toBuffer: function(parameter) {
    const value = parameter.value as string | Buffer;

    if (value != null) {
      return Buffer.isBuffer(value) ? value : Buffer.from(value);
    } else {
      // PLP NULL
      return Buffer.from([ 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF ]);
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
