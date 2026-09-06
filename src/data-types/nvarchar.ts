import { type DataType, type ParameterData } from '../data-type';
import { isAsyncIterable, writePlpStream, writePlpValue } from './plp-stream';

const MAX = (1 << 16) - 1;

const NULL_LENGTH = Buffer.from([0xFF, 0xFF]);
const MAX_NULL_LENGTH = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
const NO_COLLATION = Buffer.alloc(5);

function encodeUcs2(chunk: unknown): Buffer {
  if (typeof chunk !== 'string') {
    throw new TypeError('Invalid string.');
  }
  return Buffer.from(chunk, 'ucs2');
}

const NVarChar: { maximumLength: number } & DataType = {
  id: 0xE7,
  type: 'NVARCHAR',
  name: 'NVarChar',
  maximumLength: 4000,

  declaration: function(parameter) {
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.

    if (isAsyncIterable(value)) {
      return 'nvarchar(max)';
    }

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

    if (length <= this.maximumLength) {
      return 'nvarchar(' + length + ')';
    } else {
      return 'nvarchar(max)';
    }
  },

  resolveLength: function(parameter) {
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.
    if (parameter.length != null) {
      return parameter.length;
    } else if (value != null) {
      if (Buffer.isBuffer(value)) {
        return (value.length / 2) || 1;
      } else {
        return value.toString().length || 1;
      }
    } else {
      return this.maximumLength;
    }
  },

  writeTypeInfo(buffer, parameter) {
    buffer.writeUInt8(this.id);

    if (parameter.length! <= this.maximumLength) {
      buffer.writeUInt16LE(parameter.length! * 2);
    } else {
      buffer.writeUInt16LE(MAX);
    }

    if (parameter.collation) {
      buffer.writeBuffer(parameter.collation.toBuffer().subarray(0, 5));
    } else {
      buffer.writeBuffer(NO_COLLATION);
    }
  },

  validate: function(value): null | string {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new TypeError('Invalid string.');
    }

    return value;
  },

  resolve(parameter, collation) {
    if (isAsyncIterable(parameter.value)) {
      // Read from its source while the request is written, and sent as
      // `nvarchar(max)` since its length is not known up front.
      const data: ParameterData = { value: parameter.value, length: MAX };
      if (collation) {
        data.collation = collation;
      }
      return data;
    }

    const value = this.validate(parameter.value, collation);
    const data: ParameterData = { value };
    data.length = parameter.length != null ? parameter.length : this.resolveLength!({ ...parameter, value });
    if (collation) {
      data.collation = collation;
    }
    return data;
  },

  compileWriter(column) {
    if (column.length! <= this.maximumLength) {
      return (buffer, raw) => {
        const value = NVarChar.validate(raw, undefined);
        if (value == null) {
          buffer.writeBuffer(NULL_LENGTH);
          return;
        }

        buffer.writeUInt16LE(value.length * 2);
        buffer.writeString(value, 'ucs2');
      };
    }

    // nvarchar(max): a string, or a source read while the request is written.
    return (buffer, raw) => {
      if (isAsyncIterable(raw)) {
        return writePlpStream(buffer, raw, encodeUcs2);
      }

      const value = NVarChar.validate(raw, undefined);
      if (value == null) {
        buffer.writeBuffer(MAX_NULL_LENGTH);
        return;
      }

      writePlpValue(buffer, Buffer.from(value, 'ucs2'));
    };
  }
};

export default NVarChar;
module.exports = NVarChar;
