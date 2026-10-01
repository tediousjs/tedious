import iconv from 'iconv-lite';

import { type DataType, type ParameterData } from '../data-type';
import { type Collation } from '../collation';
import { isAsyncIterable, writePlpStream, writePlpValue } from './plp-stream';

const MAX = (1 << 16) - 1;

const NULL_LENGTH = Buffer.from([0xFF, 0xFF]);
const MAX_NULL_LENGTH = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
const NO_COLLATION = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00]);

// Each chunk is encoded on its own, as `Writable.prototype.write` would
// encode it: a source must not split a UTF-16 surrogate pair across two
// chunks (see `Request.addParameter`).
function encoderFor(collation: Collation | undefined): (chunk: unknown) => Buffer {
  return (chunk) => {
    if (typeof chunk !== 'string') {
      throw new TypeError('Invalid string.');
    }
    return VarChar.validate(chunk, collation);
  };
}

const VarChar: { maximumLength: number } & DataType = {
  id: 0xA7,
  type: 'BIGVARCHR',
  name: 'VarChar',
  maximumLength: 8000,

  declaration: function(parameter) {
    const value = parameter.value as Buffer | null;

    if (isAsyncIterable(value)) {
      return 'varchar(max)';
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
      return 'varchar(' + length + ')';
    } else {
      return 'varchar(max)';
    }
  },

  resolveLength: function(parameter) {
    const value = parameter.value as Buffer | null;

    if (parameter.length != null) {
      return parameter.length;
    } else if (value != null) {
      return value.length || 1;
    } else {
      return this.maximumLength;
    }
  },

  validate: function(value, collation): Buffer | null {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new TypeError('Invalid string.');
    }

    if (!collation) {
      throw new Error('No collation was set by the server for the current connection.');
    }

    if (!collation.codepage) {
      throw new Error('The collation set by the server has no associated encoding.');
    }

    return iconv.encode(value, collation.codepage);
  },

  resolve(parameter, collation) {
    if (isAsyncIterable(parameter.value)) {
      // Read from its source while the request is written, and sent as
      // `varchar(max)` since its length is not known up front. The chunks
      // are encoded as they arrive, so the collation is checked here, as
      // `validate` does for an in-memory value, rather than once the
      // request is already being written.
      if (!collation) {
        throw new Error('No collation was set by the server for the current connection.');
      }

      if (!collation.codepage) {
        throw new Error('The collation set by the server has no associated encoding.');
      }

      return { value: parameter.value, length: MAX, collation };
    }

    const value = this.validate(parameter.value, collation);
    const data: ParameterData = { value };
    data.length = parameter.length != null ? parameter.length : this.resolveLength!({ ...parameter, value });
    if (collation) {
      data.collation = collation;
    }
    return data;
  },

  writeTypeInfo(buffer, parameter) {
    buffer.writeUInt8(this.id);

    if (parameter.length! <= this.maximumLength) {
      buffer.writeUInt16LE(parameter.length!);
    } else {
      buffer.writeUInt16LE(MAX);
    }

    if (parameter.collation) {
      buffer.writeBuffer(parameter.collation.toBuffer().subarray(0, 5));
    } else {
      buffer.writeBuffer(NO_COLLATION);
    }
  },

  compileWriter(column) {
    const collation = column.collation;

    if (column.length! <= this.maximumLength) {
      return (buffer, raw) => {
        // A buffer is the value as `validate` encoded it, for a parameter
        // resolved before the request is written.
        // A buffer is the value as `validate` encoded it, for a parameter
      // resolved before the request is written.
      const value = Buffer.isBuffer(raw) ? raw : VarChar.validate(raw, collation);
        if (value == null) {
          buffer.writeBuffer(NULL_LENGTH);
          return;
        }

        buffer.writeUInt16LE(value.length);
        buffer.writeBuffer(value);
      };
    }

    // varchar(max): a string, or a source read while the request is written.
    return (buffer, raw) => {
      if (isAsyncIterable(raw)) {
        return writePlpStream(buffer, raw, encoderFor(collation));
      }

      // A buffer is the value as `validate` encoded it, for a parameter
      // resolved before the request is written.
      const value = Buffer.isBuffer(raw) ? raw : VarChar.validate(raw, collation);
      if (value == null) {
        buffer.writeBuffer(MAX_NULL_LENGTH);
        return;
      }

      writePlpValue(buffer, value);
    };
  }
};

export default VarChar;
module.exports = VarChar;
