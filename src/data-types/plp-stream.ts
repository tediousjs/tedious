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
export async function * writePlpStream<T>(
  buffer: WritableTrackingBuffer,
  source: AsyncIterable<T>,
  encode: (chunk: T) => Buffer,
  flush?: () => Buffer | undefined
): AsyncGenerator<void, void> {
  buffer.writeBuffer(UNKNOWN_PLP_LEN);

  const writeChunk = (bytes: Buffer | undefined) => {
    if (!bytes || bytes.length === 0) {
      return false;
    }

    buffer.writeUInt32LE(bytes.length);
    buffer.writeBuffer(bytes);
    return buffer.length >= WritableTrackingBuffer.CHUNK_SIZE;
  };

  for await (const chunk of source) {
    if (writeChunk(encode(chunk))) {
      yield;
    }
  }

  if (writeChunk(flush?.())) {
    yield;
  }

  buffer.writeBuffer(PLP_TERMINATOR);
}
