import { type DataType } from '../data-type';

const NULL_LENGTH = Buffer.from([0xFF, 0xFF]);

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

  writeTypeInfo(buffer, parameter) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt16LE(parameter.length!);
  },

  compileWriter(column) {
    const length = column.length;
    return (buffer, raw) => {
      const value = Binary.validate(raw, undefined) as Buffer | null;
      if (value == null) {
        buffer.writeBuffer(NULL_LENGTH);
        return;
      }

      buffer.writeUInt16LE(length!);
      buffer.writeBuffer(value.subarray(0, length !== undefined ? Math.min(length, Binary.maximumLength) : Binary.maximumLength));
    };
  },

  validate: function(value): Buffer | null {
    if (value == null) {
      return null;
    }

    if (!Buffer.isBuffer(value)) {
      throw new TypeError('Invalid buffer.');
    }

    return value;
  }
};

export default Binary;
module.exports = Binary;
