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
      return value.length || 1;
    } else {
      return this.maximumLength;
    }
  },

  writeTypeInfo(buffer, parameter) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt16LE(parameter.length!);
  },

  writeValue(buffer, parameter) {
    const value = parameter.value as Buffer | null;
    if (value == null) {
      buffer.writeBuffer(NULL_LENGTH);
      return;
    }

    const length = parameter.length != null ? parameter.length : this.maximumLength;
    if (value.length > length) {
      throw new TypeError(`Binary value of ${value.length} bytes exceeds the declared length of ${length}.`);
    }

    // Send the actual byte count; the server pads shorter values.
    buffer.writeUInt16LE(value.length);
    buffer.writeBuffer(value);
  },

  validate: function(value): Buffer | null {
    if (value == null) {
      return null;
    }

    if (!Buffer.isBuffer(value)) {
      throw new TypeError('Invalid buffer.');
    }

    return value;
  },

  resolve(parameter) {
    let value = this.validate(parameter.value, undefined);

    // Treat a falsy length as unspecified, preserving parameter behavior.
    const length = parameter.length || this.resolveLength!(parameter);
    if (value != null && value.length > length) {
      value = value.subarray(0, length);
    }

    return { value, length };
  }
};

export default Binary;
module.exports = Binary;
