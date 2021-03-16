import { DataType } from '../data-type';

const NULL_LENGTH = Buffer.from([0xFF, 0xFF]);

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

  generateTypeInfo(parameter) {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt8(this.id, 0);
    buffer.writeUInt16LE(parameter.length!, 1);
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

    collation.copy(buffer, collation.length);
    return buffer;
  },

  generateParameterLength(parameter, options) {
    if (parameter.value == null) {
      return NULL_LENGTH;
    }

    const length = Buffer.byteLength(parameter.value.toString(), 'ascii');

    const buffer = Buffer.alloc(2);
    buffer.writeUInt16LE(length, 0);
    return buffer;
  },

  * generateParameterData(parameter, options) {
    if (parameter.value == null) {
      return;
    }

    yield Buffer.from(parameter.value, 'ascii');
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

  validate: function(value): null | string {
    if (value == null) {
      return null;
    }
    if (typeof value !== 'string') {
      if (typeof value.toString !== 'function') {
        throw new TypeError('Invalid string.');
      }
      value = value.toString();
    }
    return value;
  }
};

export default Char;
module.exports = Char;
