import { EventEmitter } from 'events';
import BulkLoad, { type Row } from './bulk-load';

function ignoreError() {}

export class BulkLoadPayload implements AsyncIterable<Buffer> {
  declare bulkLoad: BulkLoad;
  declare rows: Iterable<Row> | AsyncIterable<Row>;
  declare source: Iterator<Row> | AsyncIterator<Row>;
  declare iterator: AsyncGenerator<Buffer, void, undefined>;
  /**
   * Whether the rows have started being read, by the consumer or by
   * `close`. Either one closes the source, once.
   */
  declare started: boolean;
  /**
   * The row source, while the payload's own `'error'` listener is on it.
   */
  declare guarded: EventEmitter | undefined;
  /**
   * The first error the guarded source emitted.
   */
  declare sourceError: Error | undefined;
  declare onSourceError: (err: Error) => void;
  /**
   * Rejects with that error, so a row read pending at the time can be
   * abandoned. Only a guarded source has one.
   */
  declare abort: Promise<never> | undefined;
  declare failSource: ((err: Error) => void) | undefined;

  constructor(bulkLoad: BulkLoad, rows: Iterable<Row> | AsyncIterable<Row>) {
    this.bulkLoad = bulkLoad;
    this.rows = rows;
    this.started = false;

    // Obtaining the iterator reads nothing yet. An object can carry an
    // `undefined` `Symbol.asyncIterator` property and still be a perfectly
    // good synchronous iterable.
    this.source = typeof (rows as Partial<AsyncIterable<Row>>)[Symbol.asyncIterator] === 'function' ?
      (rows as AsyncIterable<Row>)[Symbol.asyncIterator]() :
      (rows as Iterable<Row>)[Symbol.iterator]();

    // A `Readable` (or another event-emitting source) attaches its own
    // error handling only once it is iterated, which does not happen
    // before the `INSERT BULK` statement has been accepted. An `'error'`
    // it emits in the meantime would be unhandled and crash the process.
    // With a listener in place a `Readable` keeps the error and iterating
    // it later rejects with it; an emitter that does not replay it through
    // its iterator gets it surfaced by `serialize` instead, so either way
    // it reaches the bulk load's callback. The listener comes off again
    // once the rows have been read, or the payload is closed unread. Only
    // a real emitter is guarded, not anything with a method that happens
    // to be called `on`.
    this.sourceError = undefined;
    this.onSourceError = (err) => {
      this.sourceError ??= err;
      this.failSource?.(err);
    };
    if (rows instanceof EventEmitter) {
      this.guarded = rows;
      this.abort = new Promise<never>((_, reject) => { this.failSource = reject; });
      // Nobody may be racing against it when it rejects.
      this.abort.catch(ignoreError);
      rows.on('error', this.onSourceError);
    } else {
      this.guarded = undefined;
      this.abort = undefined;
      this.failSource = undefined;
    }

    this.iterator = this.serialize();
  }

  /**
   * Marks the payload as started the moment it is first pulled, before
   * any row is read, then hands over to `serializeRows`.
   */
  async *serialize() {
    this.started = true;

    try {
      for await (const chunk of this.bulkLoad.serializeRows(this.source, this.abort)) {
        // An error the source emitted without failing its iterator ends
        // the bulk load before another chunk goes out.
        if (this.sourceError !== undefined) {
          throw this.sourceError;
        }

        yield chunk;
      }

      if (this.sourceError !== undefined) {
        throw this.sourceError;
      }
    } finally {
      this.unguard();
    }
  }

  unguard() {
    if (this.guarded) {
      this.guarded.removeListener('error', this.onSourceError);
      this.guarded = undefined;
    }
  }

  /**
   * Releases the row source of a payload whose rows were never read: the
   * `INSERT BULK` statement was rejected, or the bulk load was canceled
   * before its request message was sent. A payload that is being read
   * closes the source itself when it stops.
   */
  close() {
    if (this.started) {
      return;
    }
    this.started = true;

    this.unguard();

    // Closing is best effort: a source that fails while being released
    // has nothing to report it to, the bulk load already failed.
    if (typeof this.source.return === 'function') {
      try {
        const closing = this.source.return();
        if (closing && typeof (closing as PromiseLike<unknown>).then === 'function') {
          (closing as PromiseLike<unknown>).then(undefined, ignoreError);
        }
      } catch {
        // A synchronous source's `finally` threw.
      }
    }

    // A stream's iterator only takes effect once it has been pulled, so
    // the stream itself is destroyed to release what it holds open. Only
    // an emitter is taken for a stream, and its `destroy` is as best
    // effort as the `return` above.
    const stream = this.rows as { destroy?: () => void };
    if (this.rows instanceof EventEmitter && typeof stream.destroy === 'function') {
      try {
        stream.destroy();
      } catch {
        // Nothing left to report it to.
      }
    }
  }

  [Symbol.asyncIterator]() {
    return this.iterator;
  }

  toString(indent = '') {
    return indent + ('BulkLoad');
  }
}
