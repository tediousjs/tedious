import iconv from 'iconv-lite';

import { type DataType, type ParameterData } from '../data-type';
import { isAsyncIterable, writePlpStream } from './plp-stream';

const MAX = (1 << 16) - 1;
const UNKNOWN_PLP_LEN = Buffer.from([0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
const PLP_TERMINATOR = Buffer.from([0x00, 0x00, 0x00, 0x00]);

const NULL_LENGTH = Buffer.from([0xFF, 0xFF]);
const MAX_NULL_LENGTH = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);

// Re-chunks a string source so that a UTF-16 surrogate pair is never split
// across chunks. An async source may yield the halves of a surrogate pair in
// separate chunks; encoding each half on its own (e.g. as UTF-8) would corrupt
// the character, so a trailing lone high surrogate is carried into the next
// chunk. The result is byte-identical to encoding the whole string at once.
async function * stitchSurrogates(source: AsyncIterable<unknown>): AsyncGenerator<string, void> {
  let pending = '';

  for await (const chunk of source) {
    if (typeof chunk !== 'string') {
      throw new TypeError('Invalid string.');
    }

    let value = pending + chunk;
    pending = '';

    const lastCode = value.charCodeAt(value.length - 1);
    if (value.length > 0 && lastCode >= 0xD800 && lastCode <= 0xDBFF) {
      pending = value[value.length - 1];
      value = value.slice(0, -1);
    }

    if (value.length > 0) {
      yield value;
    }
  }

  // A dangling high surrogate is encoded as it would be in the whole string.
  if (pending) {
    yield pending;
  }
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

  generateTypeInfo(parameter) {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt8(this.id, 0);

    if (parameter.length! <= this.maximumLength) {
      buffer.writeUInt16LE(parameter.length!, 1);
    } else {
      buffer.writeUInt16LE(MAX, 1);
    }

    if (parameter.collation) {
      parameter.collation.toBuffer().copy(buffer, 3, 0, 5);
    }

    return buffer;
  },

  generateParameterLength(parameter, options) {
    const value = parameter.value as Buffer | null;

    if (value == null) {
      if (parameter.length! <= this.maximumLength) {
        return NULL_LENGTH;
      } else {
        return MAX_NULL_LENGTH;
      }
    }

    if (parameter.length! <= this.maximumLength) {
      const buffer = Buffer.alloc(2);
      buffer.writeUInt16LE(value.length, 0);
      return buffer;
    } else {
      return UNKNOWN_PLP_LEN;
    }
  },

  *generateParameterData(parameter, options) {
    const value = parameter.value as Buffer | null;

    if (value == null) {
      return;
    }

    if (parameter.length! <= this.maximumLength) {
      yield value;
    } else {
      if (value.length > 0) {
        const buffer = Buffer.alloc(4);
        buffer.writeUInt32LE(value.length, 0);
        yield buffer;

        yield value;
      }

      yield PLP_TERMINATOR;
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
      // `varchar(max)` since its length is not known up front.
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
    const collation = parameter.collation;
    if (!collation) {
      throw new Error('No collation was set by the server for the current connection.');
    }
    if (!collation.codepage) {
      throw new Error('The collation set by the server has no associated encoding.');
    }
    const codepage = collation.codepage;

    return writePlpStream(stitchSurrogates(parameter.value as AsyncIterable<unknown>), (chunk) => iconv.encode(chunk as string, codepage));
  }
};

export default VarChar;
module.exports = VarChar;
