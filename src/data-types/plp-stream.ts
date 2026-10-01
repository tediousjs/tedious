import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const UNKNOWN_PLP_LEN = Buffer.from([0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
const PLP_TERMINATOR = Buffer.from([0x00, 0x00, 0x00, 0x00]);

/**
 * A value that is read while the request is written, rather than being fully
 * in memory: the `max` text and binary types accept an async iterable of
 * chunks (strings or buffers) here.
 */
export function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return value != null && typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function';
}

/**
 * Validates string chunks and keeps surrogate pairs together for encoding.
 * Only a trailing high surrogate is held until the next non-empty chunk;
 * at EOF it is yielded as-is so the encoder handles an unpaired surrogate.
 */
export async function * stringChunks(source: AsyncIterable<unknown>): AsyncGenerator<string, void> {
  let pending = '';
  for await (const chunk of source) {
    if (typeof chunk !== 'string') {
      throw new TypeError('Invalid string.');
    }
    if (chunk.length === 0) {
      continue;
    }

    let text = pending + chunk;
    pending = '';
    const last = text.charCodeAt(text.length - 1);
    if (last >= 0xD800 && last <= 0xDBFF) {
      pending = text.slice(-1);
      text = text.slice(0, -1);
    }
    if (text.length > 0) {
      yield text;
    }
  }
  if (pending.length > 0) {
    yield pending;
  }
}

/**
 * Writes an in-memory PLP value into `buffer`: the unknown-length marker,
 * the bytes as one chunk if there are any, then the terminator.
 */
export function writePlpValue(buffer: WritableTrackingBuffer, bytes: Buffer) {
  buffer.writeBuffer(UNKNOWN_PLP_LEN);
  if (bytes.length > 0) {
    buffer.writeUInt32LE(bytes.length);
    buffer.writeBuffer(bytes);
  }
  buffer.writeBuffer(PLP_TERMINATOR);
}

/**
 * Writes a PLP value read from `source` into `buffer`: the unknown-length
 * marker, then one length-prefixed chunk per non-empty encoded piece, then
 * the terminator. Yields whenever the buffer holds a chunk's worth, as the
 * rest of a `DataType.writeValue` promises.
 */
export async function * writePlpStream<T>(buffer: WritableTrackingBuffer, source: AsyncIterable<T>, encode: (chunk: T) => Buffer): AsyncGenerator<void, void> {
  buffer.writeBuffer(UNKNOWN_PLP_LEN);

  for await (const chunk of source) {
    const bytes = encode(chunk);

    // A zero-length PLP chunk would be read as the terminator.
    if (bytes.length === 0) {
      continue;
    }

    buffer.writeUInt32LE(bytes.length);
    buffer.writeBuffer(bytes);

    if (buffer.length >= WritableTrackingBuffer.CHUNK_SIZE) {
      yield;
    }
  }

  buffer.writeBuffer(PLP_TERMINATOR);
}
