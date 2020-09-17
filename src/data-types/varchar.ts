import { DataType } from '../data-type';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const NULL = (1 << 16) - 1;
const MAX = (1 << 16) - 1;
const UNKNOWN_PLP_LEN = Buffer.from([0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
const PLP_TERMINATOR = Buffer.from([0x00, 0x00, 0x00, 0x00]);

const VarChar: { maximumLength: number } & DataType = {
  id: 0xA7,
  type: 'BIGVARCHR',
  name: 'VarChar',
  maximumLength: 8000,

  declaration: function(parameter) {
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.

    let length;
    if (parameter.length) {
      length = parameter.length;
    } else if (value != null) {
      length = value!.toString().length || 1;
    } else if (value === null && !parameter.output) {
      length = 1;
    } else {
      length = this.maximumLength;
    }

    if (length <= this.maximumLength) {
      return 'varchar(' + length + ')';
    } else {
      return 'varchar(max)';
    }
  },

  resolveLength: function(parameter) {
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.

    if (parameter.length != null) {
      return parameter.length;
    } else if (value != null) {
      if (Buffer.isBuffer(parameter.value)) {
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

    if (parameter.length! <= this.maximumLength) {
      buffer.writeUInt16LE(this.maximumLength, 1);
    } else {
      buffer.writeUInt16LE(MAX, 1);
    }

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

    collation.copy(buffer, collation.length); // Ian Fix
    return buffer;
  },


  *generateParameterData(parameter, options) {
    if (parameter.value != null) {
      let value = parameter.value;

      const length = Buffer.byteLength(value, 'ascii');

      if (!Buffer.isBuffer(value)) {
        value = value.toString();
      }

      if (parameter.length! <= this.maximumLength) {
        const buffer = Buffer.alloc(2);
        buffer.writeUInt16LE(length, 0);
        yield buffer;

        if (Buffer.isBuffer(value)) {
          yield value;
        } else {
          yield Buffer.from(value, 'ascii');
        }
      } else {
        yield UNKNOWN_PLP_LEN;

        if (length > 0) {
          const buffer = Buffer.alloc(4);
          buffer.writeUInt32LE(length, 0);
          yield buffer;

          if (Buffer.isBuffer(value)) {
            yield value;
          } else {
            yield Buffer.from(value, 'ascii');
          }
        }

        yield PLP_TERMINATOR;
      }
    } else if (parameter.length! <= this.maximumLength) {
      const buffer = new WritableTrackingBuffer(2);
      buffer.writeUInt16LE(NULL);
      yield buffer.data;
    } else {
      const buffer = new WritableTrackingBuffer(8);
      buffer.writeUInt32LE(0xFFFFFFFF);
      buffer.writeUInt32LE(0xFFFFFFFF);
      yield buffer.data;
    }
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

  validate: function(value): string | null | TypeError {
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

export default VarChar;
module.exports = VarChar;
