import { type DataType, type ParameterData } from '../data-type';
import { isAsyncIterable, writePlpStream } from './plp-stream';

const MAX = (1 << 16) - 1;
const UNKNOWN_PLP_LEN = Buffer.from([0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
const PLP_TERMINATOR = Buffer.from([0x00, 0x00, 0x00, 0x00]);

const NULL_LENGTH = Buffer.from([0xFF, 0xFF]);
const MAX_NULL_LENGTH = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
const NO_COLLATION = Buffer.alloc(5);

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

  generateTypeInfo(parameter) {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt8(this.id, 0);

    if (parameter.length! <= this.maximumLength) {
      buffer.writeUInt16LE(parameter.length! * 2, 1);
    } else {
      buffer.writeUInt16LE(MAX, 1);
    }

    if (parameter.collation) {
      parameter.collation.toBuffer().copy(buffer, 3, 0, 5);
    }

    return buffer;
  },

  generateParameterLength(parameter, options) {
    if (parameter.value == null) {
      if (parameter.length! <= this.maximumLength) {
        return NULL_LENGTH;
      } else {
        return MAX_NULL_LENGTH;
      }
    }

    let value = parameter.value;
    if (parameter.length! <= this.maximumLength) {
      let length;
      if (value instanceof Buffer) {
        length = value.length;
      } else {
        value = value.toString();
        length = Buffer.byteLength(value, 'ucs2');
      }

      const buffer = Buffer.alloc(2);
      buffer.writeUInt16LE(length, 0);
      return buffer;
    } else {
      return UNKNOWN_PLP_LEN;
    }
  },

  * generateParameterData(parameter, options) {
    if (parameter.value == null) {
      return;
    }

    let value = parameter.value;

    if (parameter.length! <= this.maximumLength) {
      if (value instanceof Buffer) {
        yield value;
      } else {
        value = value.toString();
        yield Buffer.from(value, 'ucs2');
      }
    } else {
      if (value instanceof Buffer) {
        const length = value.length;

        if (length > 0) {
          const buffer = Buffer.alloc(4);
          buffer.writeUInt32LE(length, 0);
          yield buffer;
          yield value;
        }
      } else {
        value = value.toString();
        const length = Buffer.byteLength(value, 'ucs2');

        if (length > 0) {
          const buffer = Buffer.alloc(4);
          buffer.writeUInt32LE(length, 0);
          yield buffer;
          yield Buffer.from(value, 'ucs2');
        }
      }

      yield PLP_TERMINATOR;
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

  writeValue(buffer, parameter) {
    if (parameter.value == null) {
      buffer.writeBuffer(parameter.length! <= this.maximumLength ? NULL_LENGTH : MAX_NULL_LENGTH);
      return;
    }

    const value = parameter.value instanceof Buffer ? parameter.value : parameter.value.toString();
    const length = typeof value === 'string' ? value.length * 2 : value.length;

    if (parameter.length! <= this.maximumLength) {
      buffer.writeUInt16LE(length);
    } else {
      buffer.writeBuffer(UNKNOWN_PLP_LEN);
      if (length === 0) {
        buffer.writeBuffer(PLP_TERMINATOR);
        return;
      }
      buffer.writeUInt32LE(length);
    }

    if (typeof value === 'string') {
      buffer.writeString(value, 'ucs2');
    } else {
      buffer.writeBuffer(value);
    }

    if (parameter.length! > this.maximumLength) {
      buffer.writeBuffer(PLP_TERMINATOR);
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
      const data: ParameterData = { value: parameter.value, length: MAX, streamed: true };
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

  writeValueStream(parameter) {
    return writePlpStream(parameter.value as AsyncIterable<unknown>, (chunk) => {
      if (typeof chunk !== 'string') {
        throw new TypeError('Invalid string.');
      }
      return Buffer.from(chunk, 'ucs2');
    });
  }
};

export default NVarChar;
module.exports = NVarChar;
