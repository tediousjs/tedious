import { type DataType } from '../data-type';

const NULL_LENGTH = Buffer.from([0xFF, 0xFF]);
const NO_COLLATION = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00]);

const NChar: DataType & { maximumLength: number } = {
  id: 0xEF,
  type: 'NCHAR',
  name: 'NChar',
  maximumLength: 4000,

  declaration: function(parameter) {
    // const value = parameter.value as null | string | { toString(): string };
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.

    let length;
    if (parameter.length) {
      length = parameter.length;
    } else if (parameter.value != null) {
      length = value.toString().length || 1;
    } else if (parameter.value === null && !parameter.output) {
      length = 1;
    } else {
      length = this.maximumLength;
    }

    if (length < this.maximumLength) {
      return 'nchar(' + length + ')';
    } else {
      return 'nchar(' + this.maximumLength + ')';
    }
  },

  resolveLength: function(parameter) {
    // const value = parameter.value as null | string | { toString(): string };
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.

    if (parameter.length != null) {
      return parameter.length;
    } else if (parameter.value != null) {
      if (Buffer.isBuffer(parameter.value)) {
        return (parameter.value.length / 2) || 1;
      } else {
        return value.toString().length || 1;
      }
    } else {
      return this.maximumLength;
    }
  },

  writeTypeInfo(buffer, parameter) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt16LE(parameter.length! * 2);
    if (parameter.collation) {
      buffer.writeBuffer(parameter.collation.toBuffer().subarray(0, 5));
    } else {
      buffer.writeBuffer(NO_COLLATION);
    }
  },

  compileWriter() {
    return (buffer, raw) => {
      const value = NChar.validate(raw, undefined);
      if (value == null) {
        buffer.writeBuffer(NULL_LENGTH);
        return;
      }

      buffer.writeUInt16LE(value.length * 2);
      buffer.writeString(value, 'ucs2');
    };
  },

  validate: function(value): string | null {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new TypeError('Invalid string.');
    }

    return value;
  }
};

export default NChar;
module.exports = NChar;
