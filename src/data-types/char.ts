import { DataType, ParameterData } from '../data-type';

const NULL = (1 << 16) - 1;

const Char: { maximumLength: number } & DataType = {
  id: 0xAF,
  type: 'BIGCHAR',
  name: 'Char',
  maximumLength: 8000,

  declaration: function(parameter) {
    // const value = parameter.value as null | string | { toString(): string };
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.

    let length;
    if (parameter.length) {
      length = parameter.length;
    } else if (value != null) {
      length = value.toString().length || 1;
    } else if (value === null && !parameter.output) {
      length = 1;
    } else {
      length = this.maximumLength;
    }

    if (length < this.maximumLength) {
      return 'char(' + length + ')';
    } else {
      return 'char(' + this.maximumLength + ')';
    }
  },

  // ParameterData<any> is temporary solution. TODO: need to understand what type ParameterData<...> can be.
  resolveLength: function(parameter) {
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.
    if (parameter.length != null) {
      return parameter.length;
    } else if (value != null) {
      if (Buffer.isBuffer(value)) {
        return value.length || 1;
      } else {
        return value.toString().length || 1;
      }
    } else {
      return this.maximumLength;
    }
  },

  writeTypeInfo: function(buffer, parameter: ParameterData<any>) {
    buffer.writeUInt8(this.id);
    buffer.writeUInt16LE(parameter.length);

    const collation = Buffer.alloc(5);

    if (parameter.collation != null) {
      const { lcid, flags, version, sortId } = parameter.collation;
      collation.writeUInt8(
        (lcid) & 0xFF,
        0,
      );
      collation.writeUInt8(
        (lcid >> 8) & 0xFF,
        1,
      );
      // byte index 2 contains data for both lcid and flags
      collation.writeUInt8(
        ((lcid >> 16) & 0x0F) | (((flags) & 0x0F) << 4),
        2,
      );
      // byte index 3 contains data for both flags and version
      collation.writeUInt8(
        ((flags) & 0xF0) | ((version) & 0x0F),
        3,
      );
      collation.writeUInt8(
        (sortId) & 0xFF,
        4,
      );
    }

    buffer.writeBuffer(collation);
  },

  writeParameterData: function(buffer, parameter: ParameterData<Buffer | null>, options, cb) {
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.

    if (value != null) {
      buffer.writeUsVarbyte(value, 'ascii');
    } else {
      buffer.writeUInt16LE(NULL);
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

  validate: function(value): null | string | TypeError {
    if (value == null) {
      return null;
    }
    if (typeof value !== 'string') {
      if (typeof value.toString !== 'function') {
        return TypeError('Invalid string.');
      }
      value = value.toString();
    }
    return value;
  }
};

export default Char;
module.exports = Char;
