import { type DataType } from '../data-type';
import { isAsyncIterable, writePlpStream, writePlpValue } from './plp-stream';

const MAX_NULL_LENGTH = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);

// Each chunk is encoded on its own: a source must not split a UTF-16
// surrogate pair across two chunks (see `Request.addParameter`).
function encodeChunk(chunk: unknown): Buffer {
  if (typeof chunk !== 'string') {
    throw new TypeError('Invalid JSON chunk: a json value read from a source must be read as strings.');
  }

  return Buffer.from(chunk, 'utf8');
}

class InvalidJsonValueError extends TypeError {}

// Error messages must not quote the value: they end up in the `EPARAM`
// error and the debug log.
function assertSerializable(value: unknown) {
  if (typeof value === 'number' || value instanceof Number) {
    if (!Number.isFinite(Number(value))) {
      throw new InvalidJsonValueError('Invalid JSON value: `NaN` and `Infinity` can not be represented in JSON.');
    }
    return;
  }

  if (typeof value === 'bigint') {
    throw new InvalidJsonValueError('Invalid JSON value: bigints can not be represented in JSON.');
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value) || value instanceof String) {
    return;
  }

  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof SharedArrayBuffer) {
    throw new InvalidJsonValueError('Invalid JSON value: binary data (`Buffer`s, typed arrays and `ArrayBuffer`s) can not be represented in JSON.');
  }

  if (isAsyncIterable(value)) {
    throw new InvalidJsonValueError('Invalid JSON value: async iterables and streams can only be given as the value of a parameter, not nested in one, nor as a bulk load or table-valued parameter cell.');
  }

  if (typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function' || value instanceof WeakMap || value instanceof WeakSet) {
    throw new InvalidJsonValueError('Invalid JSON value: iterables other than arrays (e.g. `Map`s, `Set`s and generators) can not be represented in JSON.');
  }
}

// Called by `JSON.stringify` for every value, including the top level one.
// `holder[key]` is the value before its `toJSON` (e.g. `Buffer.prototype.toJSON`)
// was applied, `value` the one after.
function replacer(this: Record<string, unknown>, key: string, value: unknown) {
  const original = this[key];
  assertSerializable(original);
  if (value !== original) {
    assertSerializable(value);
  }
  return value;
}

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

  writeTypeInfo(buffer) {
    buffer.writeUInt8(this.id);
  },

  writeValue(buffer, parameter) {
    if (parameter.value == null) {
      buffer.writeBuffer(MAX_NULL_LENGTH);
      return;
    }

    if (isAsyncIterable(parameter.value)) {
      return writePlpStream(buffer, parameter.value, encodeChunk);
    }

    // `validate` serialized and encoded the value.
    writePlpValue(buffer, parameter.value as Buffer);
  },

  // Strings are JSON text and are sent as is: the server validates them.
  // Everything else is serialized with `JSON.stringify`, rejecting the
  // values it would silently turn into something else.
  validate: function(value): Buffer | null {
    if (value == null) {
      return null;
    }

    if (typeof value === 'string' || value instanceof String) {
      return Buffer.from(String(value), 'utf8');
    }

    let serialized;
    try {
      serialized = JSON.stringify(value, replacer);
    } catch (error) {
      if (error instanceof InvalidJsonValueError) {
        throw error;
      }

      throw new TypeError('Invalid JSON value: the value could not be serialized to JSON.', { cause: error });
    }

    if (serialized === undefined) {
      throw new TypeError('Invalid JSON value: the value could not be serialized to JSON.');
    }

    return Buffer.from(serialized, 'utf8');
  }
};

export default Json;
module.exports = Json;
