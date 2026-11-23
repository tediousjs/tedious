import { type DataType } from '../data-type';
import { isAsyncIterable, writePlpStream, writePlpValue } from './plp-stream';

const MAX_NULL_LENGTH = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);

// Error messages must not quote the value: they end up in the `EPARAM`
// error and the debug log.
const INVALID_VALUE_MESSAGE = 'Invalid JSON value: expected a string of JSON text.';
const INVALID_CHUNK_MESSAGE = 'Invalid JSON chunk: a json value read from a source must be read as strings of JSON text.';

/**
 * Encodes string chunks as UTF-8. A high surrogate at the end of a chunk is
 * held back until the next chunk arrives, so that a surrogate pair split
 * across two chunks is encoded as the character it forms, exactly like the
 * same text encoded in one piece.
 */
function createUtf8Encoder() {
  let pending = '';

  return {
    write(chunk: string): Buffer {
      let text = pending + chunk;
      pending = '';

      const last = text.charCodeAt(text.length - 1);
      if (last >= 0xD800 && last <= 0xDBFF) {
        pending = text[text.length - 1];
        text = text.slice(0, -1);
      }

      return Buffer.from(text, 'utf8');
    },

    end(): Buffer | undefined {
      return pending ? Buffer.from(pending, 'utf8') : undefined;
    }
  };
}

/**
 * The `json` data type (SQL Server 2025 and Azure SQL).
 *
 * Values are JSON text in both directions: a parameter value is a `string`
 * (or, for parameters, an async iterable of string chunks) that is sent as
 * is, and values read from the server are returned as unparsed strings.
 * Tedious never calls `JSON.stringify` or `JSON.parse` - callers encode and
 * decode values themselves. The server validates the JSON text.
 */
const Json: DataType = {
  id: 0xF4,
  type: 'JSON',
  name: 'JSON',

  declaration: function() {
    return 'json';
  },

  resolve(parameter) {
    // Read from its source while the request is written.
    if (isAsyncIterable(parameter.value)) {
      return { value: parameter.value };
    }

    return { value: this.validate(parameter.value, undefined) };
  },

  // The `json` TYPE_INFO is the type id alone: no length and no collation
  // (the data is always UTF-8).
  writeTypeInfo(buffer) {
    buffer.writeUInt8(this.id);
  },

  writeValue(buffer, parameter) {
    if (parameter.value == null) {
      buffer.writeBuffer(MAX_NULL_LENGTH);
      return;
    }

    if (isAsyncIterable(parameter.value)) {
      const encoder = createUtf8Encoder();
      return writePlpStream(
        buffer,
        parameter.value,
        (chunk) => {
          if (typeof chunk !== 'string') {
            throw new TypeError(INVALID_CHUNK_MESSAGE);
          }

          return encoder.write(chunk);
        },
        () => encoder.end()
      );
    }

    // `validate` encoded the value.
    writePlpValue(buffer, parameter.value as Buffer);
  },

  validate: function(value): Buffer | null {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new TypeError(INVALID_VALUE_MESSAGE);
    }

    return Buffer.from(value, 'utf8');
  }
};

export default Json;
module.exports = Json;
