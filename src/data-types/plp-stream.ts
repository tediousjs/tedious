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
 * Streams a PLP value: the unknown-length marker, then one length-prefixed
 * chunk per non-empty encoded piece read from `source`, then the terminator.
 * Pieces are coalesced up to `CHUNK_SIZE` before being handed out, so the
 * number of yields is proportional to the byte size, not the chunk count.
 */
export async function * writePlpStream(source: AsyncIterable<unknown>, encode: (chunk: unknown) => Buffer): AsyncGenerator<Buffer, void> {
  const buffer = new WritableTrackingBuffer();
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
      yield * buffer.getBuffers();
      buffer.consume(buffer.length);
    }
  }

  buffer.writeBuffer(PLP_TERMINATOR);
  yield * buffer.getBuffers();
}
