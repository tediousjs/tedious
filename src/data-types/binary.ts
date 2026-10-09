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

  writeValue(buffer, parameter) {
    const value = parameter.value as Buffer | null;
    if (value == null) {
      buffer.writeBuffer(NULL_LENGTH);
      return;
    }

    // The data length is the number of bytes actually sent, which can be less
    // than the declared length; the server pads the value to that length.
    const length = Math.min(value.length, parameter.length !== undefined ? parameter.length : Binary.maximumLength, Binary.maximumLength);
    buffer.writeUInt16LE(length);
    buffer.writeBuffer(value.subarray(0, length));
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
    const value = this.validate(parameter.value, undefined);

    // A falsy length (`0`, `NaN`) is treated as unspecified, as `declaration`
    // does, so that the TYPE_INFO matches the declared `binary(n)`. The
    // server rejects a declared length of 0, so an empty value is declared
    // as `binary(1)`.
    let length = parameter.length;
    if (!length) {
      length = value != null ? value.length || 1 : this.maximumLength;
    }

    return { value, length };
  }
};

export default Binary;
module.exports = Binary;
