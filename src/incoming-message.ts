import { Readable } from 'stream';

/**
 * A consumer of an incoming message's data that receives it synchronously,
 * as it arrives.
 */
export interface MessageSink {
  /**
   * Receives a chunk of the message's data. Returns `false` if no more
   * data should be delivered until the sink calls `IncomingMessage.continueSink`.
   */
  push(data: Buffer): boolean;

  /**
   * Called once all of the message's data has been delivered.
   */
  end(): void;
}

/**
 * An incoming TDS message.
 *
 * The message's data can be consumed in one of two ways:
 *
 * - as a regular `Readable` stream (e.g. via `for await`), in which case
 *   the data is buffered by the stream until it is read, or
 * - by attaching a `MessageSink`, which receives every chunk synchronously
 *   as it is written to the message, without any buffering or stream
 *   machinery in between.
 */
class IncomingMessage extends Readable {
  declare type: number;
  declare resetConnection: boolean;

  declare sink: MessageSink | undefined;
  /**
   * Whether the sink has asked for delivery to be suspended.
   */
  declare stalled: boolean;
  /**
   * Whether all of the message's data has been written.
   */
  declare ended: boolean;
  declare endDelivered: boolean;
  /**
   * Called when the message can accept more data after `write` returned
   * `false`.
   */
  declare onDrain: (() => void) | undefined;
  /**
   * Whether buffered data is currently being delivered to the sink.
   */
  declare flushing: boolean;

  constructor({ type }: { type: number }) {
    super();

    this.type = type;
    this.resetConnection = false;
    this.sink = undefined;
    this.stalled = false;
    this.ended = false;
    this.endDelivered = false;
    this.onDrain = undefined;
    this.flushing = false;
  }

  _read() {
    // While buffered data is being delivered to the sink, the stream's
    // buffer draining must not let the writer add data, as it would be
    // delivered ahead of what is still buffered.
    if (!this.flushing) {
      this.notifyDrain();
    }
  }

  notifyDrain() {
    const onDrain = this.onDrain;
    if (onDrain !== undefined) {
      this.onDrain = undefined;
      onDrain();
    }
  }

  /**
   * Adds data to the message. Returns `false` if no more data should be
   * written until `onDrain` is called.
   */
  write(data: Buffer): boolean {
    const sink = this.sink;
    if (sink !== undefined && !this.stalled) {
      if (sink.push(data)) {
        return true;
      }

      this.stalled = true;
      return false;
    }

    // No sink yet, or the sink asked for delivery to be suspended while
    // data was still buffered: buffer the data, and hold the writer back
    // while the sink is stalled.
    const accepted = this.push(data);
    return accepted && !this.stalled;
  }

  /**
   * Marks the message's data as complete.
   */
  end() {
    this.ended = true;

    if (this.sink !== undefined) {
      if (!this.stalled) {
        this.endDelivered = true;
        this.sink.end();
      }
    } else {
      this.push(null);
    }
  }

  /**
   * Attaches a sink that receives the message's data. Data that was already
   * buffered is delivered to the sink right away.
   */
  attach(sink: MessageSink) {
    if (this.sink !== undefined) {
      throw new Error('A sink is already attached to this message');
    }

    this.sink = sink;
    this.flushToSink();

    if (!this.stalled) {
      // The writer may have been held back by the stream's buffer.
      this.notifyDrain();
    }
  }

  /**
   * Delivers buffered data (and the end of the message) to the sink.
   */
  flushToSink() {
    const sink = this.sink!;

    this.flushing = true;
    try {
      let chunk;
      while ((chunk = this.read()) !== null) {
        if (!sink.push(chunk)) {
          this.stalled = true;
          return;
        }
      }

      if (this.ended && !this.endDelivered) {
        this.endDelivered = true;
        sink.end();
      }
    } finally {
      this.flushing = false;
    }
  }

  /**
   * To be called by the sink once it can accept more data after its `push`
   * returned `false`.
   */
  continueSink() {
    if (!this.stalled) {
      return;
    }

    this.stalled = false;
    this.flushToSink();

    if (!this.stalled) {
      this.notifyDrain();
    }
  }
}

export default IncomingMessage;
module.exports = IncomingMessage;
