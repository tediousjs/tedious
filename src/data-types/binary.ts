import { DataType, ParameterData } from '../data-type';

const NULL = (1 << 16) - 1;

const Binary: { maximumLength: number } & DataType = {
  id: 0xAD,
  type: 'BIGBinary',
  name: 'Binary',
  maximumLength: 8000,

  declaration: function(parameter) {
    const value = parameter.value as Buffer | null;

    var length;
    if (parameter.length) {
      length = parameter.length;
    } else if (value != null) {
      length = value.length || 1;
    } else if (value === null && !parameter.output) {
      length = 1;
    } else {
      length = this.maximumLength;
    }

    return 'binary(' + length + ')';
  },

  resolveLength: function(parameter) {
    const value = parameter.value as Buffer | null;

    if (value != null) {
      return value.length;
    } else {
      return this.maximumLength;
    }
  },

  writeTypeInfo: function(buffer, parameter: ParameterData<Buffer | null>) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt16LE(parameter.length);
  },

  writeParameterData: function(buffer, parameter: ParameterData<Buffer | null>, _options, cb) {
    if (parameter.value != null) {
      buffer.writeUInt16LE(parameter.length);
      buffer.writeBuffer(parameter.value.slice(0, parameter.length !== undefined ? Math.min(parameter.length, this.maximumLength) : this.maximumLength));
    } else {
      buffer.writeUInt16LE(NULL);
    }
    cb();
  },

  validate: function(value) : Buffer | null | TypeError {
    if (value == null) {
      return null;
    }

    if (!Buffer.isBuffer(value)) {
      return new TypeError('Invalid buffer.');
    }

    return value;
  }
};

export default Binary;
module.exports = Binary;
