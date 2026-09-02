import { type DataType, type ParameterData } from '../data-type';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const MAX = (1 << 16) - 1;
const UNKNOWN_PLP_LEN = Buffer.from([0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
const PLP_TERMINATOR = Buffer.from([0x00, 0x00, 0x00, 0x00]);

const NULL_LENGTH = Buffer.from([0xFF, 0xFF]);
const MAX_NULL_LENGTH = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return value != null && typeof (value as any)[Symbol.asyncIterator] === 'function';
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

  generateTypeInfo: function(parameter) {
    const buffer = Buffer.alloc(3);
    buffer.writeUInt8(this.id, 0);

    if (parameter.length! <= this.maximumLength) {
      buffer.writeUInt16LE(parameter.length!, 1);
    } else {
      buffer.writeUInt16LE(MAX, 1);
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
    if (!Buffer.isBuffer(value)) {
      value = value.toString();
    }

    const length = Buffer.byteLength(value, 'ucs2');

    if (parameter.length! <= this.maximumLength) {
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
      if (Buffer.isBuffer(value)) {
        yield value;
      } else {
        yield Buffer.from(value.toString(), 'ucs2');
      }
    } else {
      if (!Buffer.isBuffer(value)) {
        value = value.toString();
      }

      const length = Buffer.byteLength(value, 'ucs2');

      if (length > 0) {
        const buffer = Buffer.alloc(4);
        buffer.writeUInt32LE(length, 0);
        yield buffer;

        if (Buffer.isBuffer(value)) {
          yield value;
        } else {
          yield Buffer.from(value, 'ucs2');
        }
      }

      yield PLP_TERMINATOR;
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

  writeValue(buffer, parameter) {
    if (parameter.value == null) {
      buffer.writeBuffer(parameter.length! <= this.maximumLength ? NULL_LENGTH : MAX_NULL_LENGTH);
      return;
    }

    const value = Buffer.isBuffer(parameter.value) ? parameter.value : parameter.value.toString();
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
      // length is not known up front, so it is sent as `varbinary(max)`.
      return { value: parameter.value, length: MAX, streamed: true };
    }

    const value = this.validate(parameter.value, undefined);
    const data: ParameterData = { value };
    data.length = parameter.length != null ? parameter.length : this.resolveLength!({ ...parameter, value });
    return data;
  },

  async * writeValueStream(parameter) {
    const buffer = new WritableTrackingBuffer();
    buffer.writeBuffer(UNKNOWN_PLP_LEN);

    for await (const chunk of parameter.value as AsyncIterable<unknown>) {
      if (!Buffer.isBuffer(chunk)) {
        throw new TypeError('Invalid buffer.');
      }

      // A PLP chunk of length zero would be read as the terminator.
      if (chunk.length === 0) {
        continue;
      }

      buffer.writeUInt32LE(chunk.length);
      buffer.writeBuffer(chunk);

      if (buffer.length >= WritableTrackingBuffer.CHUNK_SIZE) {
        yield * buffer.getBuffers();
        buffer.consume(buffer.length);
      }
    }

    buffer.writeBuffer(PLP_TERMINATOR);
    yield * buffer.getBuffers();
  }
};

export default VarBinary;
module.exports = VarBinary;
