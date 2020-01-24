import { DataType, ParameterData } from '../data-type';

const NULL_BUFFER = Buffer.from([0xFF, 0xFF]);

const Binary: { maximumLength: number } & DataType = {
  id: 0xAD,
  type: 'BIGBinary',
  name: 'Binary',
  maximumLength: 8000,

  declaration: function(parameter) {
    const value = parameter.value as Buffer | null;

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

  writeParameterData: function(buff, parameter, options, cb) {
    buff.writeBuffer(Buffer.concat(Array.from(this.generate(parameter, options))));
    cb();
  },

  generate: function* (parameter, options) {
    if (parameter.value != null) {
      const dataLength = parameter.length !== undefined ? Math.min(parameter.length, this.maximumLength) : this.maximumLength;

      const buffer = Buffer.alloc(2 + dataLength);
      buffer.writeUInt16LE(dataLength, 0);
      parameter.value.copy(buffer, 2, 0, dataLength);

      yield buffer;
    } else {
      yield NULL_BUFFER;
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

export default Binary;
module.exports = Binary;
