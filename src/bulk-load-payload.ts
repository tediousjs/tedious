import { EventEmitter } from 'events';
import BulkLoad, { type Row, type RowSource } from './bulk-load';
import { RequestError } from './errors';

function ignoreError() {}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return value != null && typeof (value as PromiseLike<T>).then === 'function';
}

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
   * Rejects once the bulk load must stop reading rows: the source
   * reported an error out of band, or the bulk load was canceled. A row
   * read pending at the time is abandoned.
   */
  declare aborted: Promise<never>;
  declare rejectAborted: (err: Error) => void;
  /**
   * On the bulk load until the payload is done with its rows, so that a
   * completed bulk load an application holds on to does not hold on to
   * the payload, and with it the rows, through this listener.
   */
  declare onCancel: () => void;

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
    this.aborted = new Promise<never>((_, reject) => { this.rejectAborted = reject; });
    // Nobody may be racing against it when it rejects.
    this.aborted.catch(ignoreError);

    this.sourceError = undefined;
    this.onSourceError = (err) => {
      this.sourceError ??= err;
      this.rejectAborted(err);
    };
    if (rows instanceof EventEmitter) {
      this.guarded = rows;
      rows.on('error', this.onSourceError);
    } else {
      this.guarded = undefined;
    }

    // A cancellation while the rows are being sent stops the payload
    // stream, but a row read pending inside the payload must be abandoned
    // as well, or a source that never delivers the row would keep the bulk
    // load's resources open. The consumer has stopped pulling by then, so
    // the reason reaches nobody, but the source is closed as on any other
    // failure.
    this.onCancel = () => {
      this.rejectAborted(new RequestError('Canceled.', 'ECANCEL'));
    };
    bulkLoad.once('cancel', this.onCancel);

    this.iterator = this.serialize();
  }

  /**
   * Marks the payload as started the moment it is first pulled, before
   * any row is read, then hands over to `serializeRows`.
   */
  async *serialize() {
    this.started = true;

    // `serializeRows` closes the source when it leaves early, without
    // waiting for it on a failure. The source is watched so that the
    // error guard can stay on it while an asynchronous close is still
    // running: an `'error'` the close emits on a later tick would
    // otherwise be unhandled. `closing` is the close in progress, if any.
    const source = this.source;
    let closing: Promise<unknown> | undefined;
    const watched: RowSource = {
      next: () => source.next(),
      return: () => {
        if (typeof source.return !== 'function') {
          return undefined;
        }

        const result = source.return();
        if (!isPromiseLike(result)) {
          return result;
        }

        // Settled into one promise, handed on as such: it may be awaited
        // and raced by `serializeRows`, and is watched here.
        const settled = Promise.resolve(result);
        closing = settled;
        const done = () => {
          if (closing === settled) {
            closing = undefined;
          }
        };
        settled.then(done, done);
        return settled;
      }
    };

    try {
      for await (const chunk of this.bulkLoad.serializeRows(watched, this.aborted)) {
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
      this.release();

      if (closing === undefined) {
        this.unguard();
      } else {
        // A close that never finishes (an async generator stuck in a
        // read) keeps the guard on the source; the source is broken by
        // then, and an error it still emits must not crash the process.
        const unguard = () => { this.unguard(); };
        closing.then(unguard, unguard);
      }
    }
  }

  /**
   * Takes the payload's listener off the bulk load. The bulk load may be
   * canceled later, but the payload no longer has a row read to abandon.
   */
  release() {
    this.bulkLoad.removeListener('cancel', this.onCancel);
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
    this.release();

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

    // A stream's iterator only takes effect once it has been pulled (a
    // `Readable` sets its iterator up, and destroys the stream when that
    // iterator is returned, in the first `next()`), so the stream itself
    // is destroyed to release what it holds open. The unit test that
    // closes a `Readable` unread pins this against a change in Node. Only
    // an emitter is taken for a stream, and its `destroy` is as best
    // effort as the `return` above. The error guard stays on until the
    // stream has finished destroying itself, since its `_destroy` may
    // report an error later, asynchronously: it comes off on `'close'`,
    // on that `'error'`, or right away when `destroy` itself throws. (A
    // stream that emits neither, `emitClose: false` and a clean
    // destruction, keeps a listener; it is dead by then.)
    const stream = this.rows as { destroy?: () => void };
    if (this.rows instanceof EventEmitter && typeof stream.destroy === 'function') {
      const emitter = this.rows;
      const destroyed = () => {
        emitter.removeListener('close', destroyed);
        emitter.removeListener('error', destroyed);
        this.unguard();
      };
      emitter.on('close', destroyed);
      emitter.on('error', destroyed);

      try {
        stream.destroy();
      } catch {
        destroyed();
      }
    } else {
      this.unguard();
    }
  }

  [Symbol.asyncIterator]() {
    return this.iterator;
  }

  toString(indent = '') {
    return indent + ('BulkLoad');
  }
}
