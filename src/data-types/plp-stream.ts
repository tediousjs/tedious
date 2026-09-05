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
 * Writes a streamed PLP value into `buffer`: the unknown-length marker, then
 * one length-prefixed chunk per non-empty encoded piece read from `source`,
 * then the terminator. Yields whenever the buffer holds a chunk's worth, as
 * `DataType.writeValueStream` promises.
 */
export async function * writePlpStream(buffer: WritableTrackingBuffer, source: AsyncIterable<unknown>, encode: (chunk: unknown) => Buffer): AsyncGenerator<void, void> {
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
