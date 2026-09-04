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
    // With a listener in place the stream keeps the error, and iterating
    // it later rejects with it, so it still reaches the bulk load's
    // callback. The listener comes off again once the rows have been
    // read, or the payload is closed unread. Only a real emitter is
    // guarded, not anything with a method that happens to be called `on`.
    if (rows instanceof EventEmitter) {
      this.guarded = rows;
      rows.on('error', ignoreError);
    } else {
      this.guarded = undefined;
    }

    this.iterator = this.serialize();
  }

  /**
   * Runs until the generator has been pulled.
   */
  async *serialize() {
    this.started = true;

    try {
      yield* this.bulkLoad.serializeRows(this.source);
    } finally {
      this.unguard();
    }
  }

  unguard() {
    if (this.guarded) {
      this.guarded.removeListener('error', ignoreError);
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

    if (typeof this.source.return === 'function') {
      const closing = this.source.return();
      if (closing && typeof (closing as PromiseLike<unknown>).then === 'function') {
        (closing as PromiseLike<unknown>).then(undefined, ignoreError);
      }
    }

    // A stream's iterator only takes effect once it has been pulled, so
    // the stream itself is destroyed to release what it holds open.
    const stream = this.rows as { destroy?: () => void };
    if (typeof stream.destroy === 'function') {
      stream.destroy();
    }
  }

  [Symbol.asyncIterator]() {
    return this.iterator;
  }

  toString(indent = '') {
    return indent + ('BulkLoad');
  }
}
