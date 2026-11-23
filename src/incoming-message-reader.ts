import { type Readable } from 'stream';

import Debug from './debug';
import { Packet, HEADER_LENGTH, OFFSET } from './packet';
import { ConnectionError } from './errors';

const STATUS_EOM = 0x01;
const EMPTY = Buffer.alloc(0);

/**
 * A TDS message read from the server.
 *
 * Iterating it yields the message's payload as it arrives, packet by packet.
 * The chunks are views into the data read from the socket; they are not
 * copied, and packet boundaries are not preserved (a packet's payload can be
 * yielded in several chunks).
 */
export class IncomingMessage implements AsyncIterable<Buffer> {
  declare type: number;
  declare resetConnection: boolean;

  declare private iterator: AsyncGenerator<Buffer, void, undefined>;

  constructor(type: number, iterator: AsyncGenerator<Buffer, void, undefined>) {
    this.type = type;
    this.resetConnection = false;
    this.iterator = iterator;
  }

  [Symbol.asyncIterator]() {
    return this.iterator;
  }
}

/**
 * Pull-based reader for TDS messages.
 *
 * Data is only read from `source` when the consumer of the current message
 * asks for more, so backpressure falls out of the control flow: a paused or
 * slow consumer simply stops pulling, and the socket stops being read.
 *
 * Only one message can be in flight at a time. `readMessage` waits until the
 * previous message has been fully consumed (or abandoned via `return()`, in
 * which case its remaining packets are skipped).
 */
class IncomingMessageReader {
  declare debug: Debug;

  declare private _source: Readable | undefined;
  // Chunks received from `_source` that were not asked for yet.
  declare private chunks: Buffer[];
  declare private ended: boolean;
  declare private waiting: ((chunk: Buffer | null) => void) | undefined;

  // Data read from `source` that has not been consumed yet.
  declare private buffer: Buffer;

  // Settles once the message currently being read was fully consumed.
  declare private previous: Promise<void>;

  constructor(source: Readable, debug: Debug) {
    this.debug = debug;
    this.onData = this.onData.bind(this);
    this.onEnd = this.onEnd.bind(this);
    this.waiting = undefined;
    this.source = source;
    this.buffer = EMPTY;
    this.previous = Promise.resolve();
  }

  async readMessage(): Promise<IncomingMessage> {
    await this.previous;

    const header = await this.readHeader();
    if (header === undefined) {
      throw new Error('unexpected end of message stream');
    }

    let done!: () => void;
    this.previous = new Promise<void>((resolve) => { done = resolve; });

    return new IncomingMessage(header.readUInt8(OFFSET.Type), this.readPayload(header, done));
  }

  private async *readPayload(header: Buffer, done: () => void): AsyncGenerator<Buffer, void, undefined> {
    // Bytes of the current packet's payload that have not been consumed yet,
    // and whether the current packet is the last one of the message.
    let remaining = header.readUInt16BE(OFFSET.Length) - HEADER_LENGTH;
    let last = (header.readUInt8(OFFSET.Status) & STATUS_EOM) !== 0;
    let completed = false;

    try {
      while (true) {
        if (this.debug.haveListeners() && this.debug.options.data) {
          // Debug output needs the whole packet, so read it in one piece.
          const data = await this.readExactly(remaining);
          remaining = 0;

          const packet = new Packet(Buffer.concat([header, data]));
          this.debug.packet('Received', packet);
          this.debug.data(packet);

          if (data.length) {
            yield data;
          }
        } else {
          this.debug.packet('Received', new Packet(header));

          while (remaining > 0) {
            if (this.buffer.length === 0) {
              this.buffer = await this.readChunkOrThrow();
            }

            const chunk = this.buffer.subarray(0, remaining);
            this.buffer = this.buffer.subarray(chunk.length);
            remaining -= chunk.length;

            yield chunk;
          }
        }

        if (last) {
          completed = true;
          return;
        }

        const next = await this.readHeader();
        if (next === undefined) {
          throw new Error('unexpected end of message stream');
        }

        header = next;
        remaining = header.readUInt16BE(OFFSET.Length) - HEADER_LENGTH;
        last = (header.readUInt8(OFFSET.Status) & STATUS_EOM) !== 0;
      }
    } finally {
      if (!completed) {
        // The consumer stopped early (or reading failed). Skip the rest of
        // the message, so the next message starts at a packet boundary. If
        // the connection broke, there is nothing left to skip and the next
        // `readMessage` call will fail.
        try {
          await this.skip(remaining);
          while (!last) {
            const next = await this.readHeader();
            if (next === undefined) {
              break;
            }
            last = (next.readUInt8(OFFSET.Status) & STATUS_EOM) !== 0;
            await this.skip(next.readUInt16BE(OFFSET.Length) - HEADER_LENGTH);
          }
        } catch {
          // Ignored: the connection is unusable at this point anyway.
        }
      }

      done();
    }
  }

  /**
   * Read the next packet header, or return `undefined` if the source ended
   * at a packet boundary.
   */
  private async readHeader(): Promise<Buffer | undefined> {
    let header;

    if (this.buffer.length >= HEADER_LENGTH) {
      header = this.buffer.subarray(0, HEADER_LENGTH);
      this.buffer = this.buffer.subarray(HEADER_LENGTH);
    } else {
      // The header is split across chunks. Apart from data debugging, this
      // is the only place data gets copied, and never more than 8 bytes.
      header = Buffer.alloc(HEADER_LENGTH);
      let offset = this.buffer.copy(header);

      while (offset < HEADER_LENGTH) {
        const chunk = await this.readChunk();
        if (chunk === null) {
          if (offset === 0) {
            this.buffer = EMPTY;
            return undefined;
          }
          throw new ConnectionError('Connection closed in the middle of a packet header');
        }

        const copied = chunk.copy(header, offset);
        offset += copied;
        this.buffer = chunk.subarray(copied);
      }
    }

    if (header.readUInt16BE(OFFSET.Length) < HEADER_LENGTH) {
      throw new ConnectionError('Unable to process incoming packet');
    }

    return header;
  }

  private async readExactly(length: number): Promise<Buffer> {
    const chunks = [];
    let have = 0;
    while (have < length) {
      if (this.buffer.length === 0) {
        this.buffer = await this.readChunkOrThrow();
      }
      const chunk = this.buffer.subarray(0, length - have);
      this.buffer = this.buffer.subarray(chunk.length);
      chunks.push(chunk);
      have += chunk.length;
    }
    return chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, length);
  }

  private async skip(length: number) {
    while (length > 0) {
      if (this.buffer.length === 0) {
        this.buffer = await this.readChunkOrThrow();
      }
      const skipped = Math.min(length, this.buffer.length);
      this.buffer = this.buffer.subarray(skipped);
      length -= skipped;
    }
  }

  private async readChunkOrThrow(): Promise<Buffer> {
    const chunk = await this.readChunk();
    if (chunk === null) {
      throw new ConnectionError('Connection closed in the middle of a packet');
    }
    return chunk;
  }

  /**
   * The stream that data is read from. Can be swapped (e.g. for the cleartext
   * side of a TLS connection) between messages, or detached with `undefined`.
   *
   * The source is kept paused, and is only resumed while a chunk is wanted.
   * Chunks are received via `'data'` events rather than `read()`, so other
   * `'data'` listeners on the source see the same chunks, and `read()` never
   * has to concatenate buffered chunks.
   */
  get source(): Readable | undefined {
    return this._source;
  }

  set source(source: Readable | undefined) {
    const previous = this._source;
    if (previous) {
      previous.removeListener('data', this.onData);
      previous.removeListener('end', this.onEnd);
      previous.removeListener('close', this.onEnd);
      previous.removeListener('error', this.onEnd);
    }

    this._source = source;
    this.chunks = [];
    this.ended = false;

    // A read pending on the previous source will never see more data.
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = undefined;
      resolve(null);
    }

    if (source) {
      source.on('data', this.onData);
      source.pause();
      source.on('end', this.onEnd);
      source.on('close', this.onEnd);
      // Socket errors are handled by the connection; here they just mean
      // no more data will arrive.
      source.on('error', this.onEnd);

      if (source.readableEnded || source.destroyed) {
        this.ended = true;
      }
    }
  }

  private onData(chunk: Buffer) {
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = undefined;
      resolve(chunk);
    } else {
      this.chunks.push(chunk);
    }
    // Stop reading until the next chunk is wanted.
    this._source?.pause();
  }

  private onEnd() {
    this.ended = true;
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = undefined;
      resolve(null);
    }
  }

  /**
   * Pull the next chunk from `source`, or `null` once it ended.
   */
  private readChunk(): Promise<Buffer | null> {
    if (this.chunks.length) {
      return Promise.resolve(this.chunks.shift()!);
    }

    if (this.ended || !this._source) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      this.waiting = resolve;
      this._source!.resume();
    });
  }
}

export default IncomingMessageReader;
