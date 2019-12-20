import { DataType } from '../data-type';

const NULL = (1 << 16) - 1;
const MAX = (1 << 16) - 1;

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

  writeTypeInfo: function(buffer, parameter) {
    buffer.writeUInt8(this.id);
    if (parameter.length != null && isFinite(parameter.length)) {
      const length = parameter.length;

      if (length <= this.maximumLength) {
        buffer.writeUInt16LE(length);
      } else {
        buffer.writeUInt16LE(this.maximumLength);
      }
    } else {
      buffer.writeUInt16LE(MAX);
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

    buffer.writeBuffer(collation);
  },

  writeParameterData: function(buffer, parameter, options, cb) {
    if (parameter.value != null) {
      if (parameter.length! <= this.maximumLength) {
        buffer.writeUsVarbyte(parameter.value, 'ascii');
      } else {
        buffer.writePLPBody(parameter.value, 'ascii');
      }
    } else if (parameter.length! <= this.maximumLength) {
      buffer.writeUInt16LE(NULL);
    } else {
      buffer.writeUInt32LE(0xFFFFFFFF);
      buffer.writeUInt32LE(0xFFFFFFFF);
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
