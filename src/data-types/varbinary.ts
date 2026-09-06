import { type DataType, type ParameterData } from '../data-type';
import { isAsyncIterable, writePlpStream, writePlpValue } from './plp-stream';

const MAX = (1 << 16) - 1;

const NULL_LENGTH = Buffer.from([0xFF, 0xFF]);
const MAX_NULL_LENGTH = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);

function requireBuffer(chunk: unknown): Buffer {
  if (!Buffer.isBuffer(chunk)) {
    throw new TypeError('Invalid buffer.');
  }
  return chunk;
}

const VarBinary: { maximumLength: number } & DataType = {
  id: 0xA5,
  type: 'BIGVARBIN',
  name: 'VarBinary',
  maximumLength: 8000,

  declaration: function(parameter) {
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.
    if (isAsyncIterable(value)) {
      return 'varbinary(max)';
    }

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

    if (length <= this.maximumLength) {
      return 'varbinary(' + length + ')';
    } else {
      return 'varbinary(max)';
    }
  },

  resolveLength: function(parameter) {
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.
    if (parameter.length != null) {
      return parameter.length;
    } else if (value != null) {
      return value.length;
    } else {
      return this.maximumLength;
    }
  },

  writeTypeInfo(buffer, parameter) {
    buffer.writeUInt8(this.id);

    if (parameter.length! <= this.maximumLength) {
      buffer.writeUInt16LE(parameter.length!);
    } else {
      buffer.writeUInt16LE(MAX);
    }
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
    if (isAsyncIterable(parameter.value)) {
      // The value is read from its source while the request is written. Its
      // length is not known up front, so it is sent as `varbinary(max)`;
      // an explicitly specified `length` is deliberately overridden.
      return { value: parameter.value, length: MAX };
    }

    const value = this.validate(parameter.value, undefined);
    const data: ParameterData = { value };
    data.length = parameter.length != null ? parameter.length : this.resolveLength!({ ...parameter, value });
    return data;
  },

  compileWriter(column) {
    if (column.length! <= this.maximumLength) {
      return (buffer, raw) => {
        const value = VarBinary.validate(raw, undefined);
        if (value == null) {
          buffer.writeBuffer(NULL_LENGTH);
          return;
        }

        buffer.writeUInt16LE(value.length);
        buffer.writeBuffer(value);
      };
    }

    // varbinary(max): a buffer, or a source read while the request is written.
    return (buffer, raw) => {
      if (isAsyncIterable(raw)) {
        return writePlpStream(buffer, raw, requireBuffer);
      }

      const value = VarBinary.validate(raw, undefined);
      if (value == null) {
        buffer.writeBuffer(MAX_NULL_LENGTH);
        return;
      }

      writePlpValue(buffer, value);
    };
  }
};

export default VarBinary;
module.exports = VarBinary;
