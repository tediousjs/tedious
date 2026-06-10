import { Transform } from 'stream';

import Debug from './debug';
import { Packet, HEADER_LENGTH, OFFSET } from './packet';
import { ConnectionError } from './errors';

const STATUS_EOM = 0x01;

/**
 * Pause framing when this much unconsumed payload data is buffered on the
 * current message.
 */
const MESSAGE_BUFFER_THRESHOLD = 32 * 1024;

/**
 * A single incoming TDS message: an async iterable over the payload chunks
 * of the message's packets.
 *
 * Designed for a single consumer. Payload chunks may be views into the
 * network buffers they were received in.
 */
export class IncomingMessage implements AsyncIterable<Buffer> {
  declare type: number;

  declare chunks: Buffer[];
  declare bufferedLength: number;
  declare ended: boolean;

  declare pendingRead: ((result: IteratorResult<Buffer, undefined>) => void) | undefined;

  /**
   * Invoked whenever the consumer makes progress, so that a producer that
   * suspended itself (backpressure, or waiting for the message to be fully
   * consumed) can continue.
   */
  declare onProgress: (() => void) | undefined;

  constructor(type: number) {
    this.type = type;

    this.chunks = [];
    this.bufferedLength = 0;
    this.ended = false;
    this.pendingRead = undefined;
    this.onProgress = undefined;
  }

  /**
   * Returns `false` once enough unconsumed data is buffered - the producer
   * should stop pushing and continue via `onProgress`.
   */
  push(chunk: Buffer): boolean {
    const pendingRead = this.pendingRead;
    if (pendingRead !== undefined) {
      this.pendingRead = undefined;
      pendingRead({ value: chunk, done: false });
      return true;
    }

    this.chunks.push(chunk);
    this.bufferedLength += chunk.length;
    return this.bufferedLength < MESSAGE_BUFFER_THRESHOLD;
  }

  end() {
    this.ended = true;

    const pendingRead = this.pendingRead;
    if (pendingRead !== undefined) {
      this.pendingRead = undefined;
      pendingRead({ value: undefined, done: true });
    }
  }

  isFullyConsumed() {
    return this.ended && this.chunks.length === 0;
  }

  [Symbol.asyncIterator](): AsyncIterator<Buffer, undefined> {
    return {
      next: (): Promise<IteratorResult<Buffer, undefined>> => {
        if (this.chunks.length > 0) {
          const chunk = this.chunks.shift()!;
          this.bufferedLength -= chunk.length;

          const onProgress = this.onProgress;
          if (onProgress !== undefined) {
            onProgress();
          }

          return Promise.resolve({ value: chunk, done: false });
        }

        if (this.ended) {
          return Promise.resolve({ value: undefined, done: true });
        }

        return new Promise((resolve) => {
          this.pendingRead = resolve;
        });
      }
    };
  }
}

/**
 * Transforms the raw TDS packet stream received from the server into
 * individual `IncomingMessage`s.
 *
 * Packet payload is passed through as views into the received network
 * buffers - packet headers are parsed in place, without materializing
 * packets or copying payload data.
 */
class IncomingMessageStream extends Transform {
  declare debug: Debug;
  declare currentMessage: IncomingMessage | undefined;

  declare private headerBuffer: Buffer;
  declare private headerLength: number;
  declare private payloadRemaining: number;
  declare private isLastPacket: boolean;

  /**
   * When packet level debugging is enabled, collects the chunks of the
   * packet that is currently being received, so it can be logged once
   * complete.
   */
  declare private packetChunks: Buffer[] | undefined;

  constructor(debug: Debug) {
    super({ readableObjectMode: true });

    this.debug = debug;
    this.currentMessage = undefined;

    this.headerBuffer = Buffer.allocUnsafe(HEADER_LENGTH);
    this.headerLength = 0;
    this.payloadRemaining = 0;
    this.isLastPacket = false;
    this.packetChunks = undefined;
  }

  _transform(chunk: Buffer, _encoding: string, callback: (err?: Error) => void) {
    this.processChunk(chunk, 0, callback);
  }

  private processChunk(chunk: Buffer, offset: number, callback: (err?: Error) => void) {
    while (offset < chunk.length) {
      if (this.headerLength < HEADER_LENGTH) {
        // Receiving the packet header.
        const headerBytes = Math.min(HEADER_LENGTH - this.headerLength, chunk.length - offset);
        chunk.copy(this.headerBuffer, this.headerLength, offset, offset + headerBytes);
        this.headerLength += headerBytes;
        offset += headerBytes;

        if (this.headerLength < HEADER_LENGTH) {
          break;
        }

        const packetLength = this.headerBuffer.readUInt16BE(OFFSET.Length);
        if (packetLength < HEADER_LENGTH) {
          return callback(new ConnectionError('Unable to process incoming packet'));
        }

        this.payloadRemaining = packetLength - HEADER_LENGTH;
        this.isLastPacket = !!(this.headerBuffer.readUInt8(OFFSET.Status) & STATUS_EOM);

        if (this.debug.haveListeners() && (this.debug.options.packet || this.debug.options.data)) {
          this.packetChunks = [Buffer.from(this.headerBuffer)];
        }

        if (this.currentMessage === undefined) {
          this.currentMessage = new IncomingMessage(this.headerBuffer.readUInt8(OFFSET.Type));
          this.push(this.currentMessage);
        }

        if (this.payloadRemaining === 0) {
          if (!this.finishPacket(chunk, offset, callback)) {
            return;
          }
        }

        continue;
      }

      // Receiving the packet payload.
      const message = this.currentMessage!;

      const payloadBytes = Math.min(this.payloadRemaining, chunk.length - offset);
      const payload = chunk.subarray(offset, offset + payloadBytes);
      offset += payloadBytes;
      this.payloadRemaining -= payloadBytes;

      if (this.packetChunks !== undefined) {
        this.packetChunks.push(Buffer.from(payload));
      }

      const writable = message.push(payload);

      if (this.payloadRemaining === 0) {
        if (!this.finishPacket(chunk, offset, callback)) {
          return;
        }
      } else if (!writable) {
        // Too much data is buffering up on the current message - wait for
        // the consumer to catch up.
        this.suspend(message, () => message.bufferedLength < MESSAGE_BUFFER_THRESHOLD, chunk, offset, callback);
        return;
      }
    }

    callback();
  }

  /**
   * Completes the current packet. Returns `false` when processing was
   * suspended until the just finished message is fully consumed.
   */
  private finishPacket(chunk: Buffer, offset: number, callback: (err?: Error) => void): boolean {
    this.headerLength = 0;

    if (this.packetChunks !== undefined) {
      const packet = new Packet(Buffer.concat(this.packetChunks));
      this.packetChunks = undefined;

      this.debug.packet('Received', packet);
      this.debug.data(packet);
    }

    if (this.isLastPacket) {
      const message = this.currentMessage!;
      this.currentMessage = undefined;
      message.end();

      // Wait until the current message was fully consumed before we
      // continue processing any remaining messages.
      if (!message.isFullyConsumed()) {
        this.suspend(message, () => message.isFullyConsumed(), chunk, offset, callback);
        return false;
      }
    }

    return true;
  }

  private suspend(message: IncomingMessage, condition: () => boolean, chunk: Buffer, offset: number, callback: (err?: Error) => void) {
    message.onProgress = () => {
      if (!condition()) {
        return;
      }

      message.onProgress = undefined;
      this.processChunk(chunk, offset, callback);
    };
  }
}

export default IncomingMessageStream;
module.exports = IncomingMessageStream;
module.exports.IncomingMessage = IncomingMessage;
