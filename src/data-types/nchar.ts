import { DataType } from '../data-type';

const NULL = (1 << 16) - 1;

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

  generateTypeInfo: function(parameter) {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt8(this.id, 0);
    buffer.writeUInt16LE(parameter.length! * 2, 1);
    return buffer;
  },

  *generateParameterData(parameter, options) {
    let value = parameter.value;
    if (parameter.value != null) {
      if (value instanceof Buffer) {
        const length = value.length;
        const buffer = Buffer.alloc(2);

        buffer.writeUInt16LE(length, 0);

        yield buffer;
        yield value;

      } else {
        value = value.toString();
        const length = Buffer.byteLength(value, 'ucs2');
        const buffer = Buffer.alloc(2);

        buffer.writeUInt16LE(length, 0);
        yield buffer;
        yield Buffer.from(value, 'ucs2');
      }
    } else {
      const buffer = Buffer.alloc(2);
      buffer.writeUInt16LE(NULL, 0);
      yield buffer;
    }
  },

  validate: function(value, length): string | null | TypeError {
    if (value === undefined || value === null) {
      return null;
    }
    const stringValue = typeof value !== 'string' && typeof value.toString === 'function' ? value.toString() : value;
    if (typeof stringValue !== 'string' || (length && stringValue.length > length) || stringValue.length > this.maximumLength) {
      return new TypeError(`The given value could not be converted to ${this.name}`);
    }

    return stringValue;
  }
};

export default NChar;
module.exports = NChar;
