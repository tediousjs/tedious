import BulkLoad from './bulk-load';
import WritableTrackingBuffer from './tracking-buffer/writable-tracking-buffer';
import { TYPE as TOKEN_TYPE } from './token/token';
import { writeValue } from './data-type';

export type Row = unknown[] | { [colName: string]: unknown };

const rowTokenBuffer = Buffer.from([ TOKEN_TYPE.ROW ]);
const textPointerAndTimestampBuffer = Buffer.from([
  // TextPointer length
  0x10,

  // TextPointer
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,

  // Timestamp
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);
const textPointerNullBuffer = Buffer.from([0x00]);

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return value != null && typeof (value as PromiseLike<T>).then === 'function';
}

function ignoreError() {}

/**
 * The TDS byte stream of a bulk load: COLMETADATA, a ROW token per row,
 * and a DONE token at the end, serialized from the bulk load's row source.
 *
 * The payload owns the row source's iterator the way a `for await` loop
 * would: it requests the first row as soon as it is created, so that a
 * stream source is observed from the moment it is handed over, and it
 * closes the source through the iterator's `return()` whenever the bulk
 * load does not run to completion, whether the rows were being read
 * ([[Symbol.asyncIterator]]) or never got to be ([[close]]).
 *
 * Rows are written into one buffer that lives for the whole bulk load.
 * Its contents are yielded once it holds a chunk's worth
 * (`WritableTrackingBuffer.CHUNK_SIZE`), checked after every cell, and at
 * the end. Rows from a synchronous source are serialized without an
 * event-loop turn in between; rows from an asynchronous source are awaited
 * one at a time.
 *
 * @private
 */
export class BulkLoadPayload implements AsyncIterable<Buffer> {
  declare bulkLoad: BulkLoad;
  declare iterator: Iterator<Row> | AsyncIterator<Row>;
  declare pending: IteratorResult<Row> | Promise<IteratorResult<Row>> | undefined;

  constructor(bulkLoad: BulkLoad, rows: Iterable<Row> | AsyncIterable<Row>) {
    this.bulkLoad = bulkLoad;

    this.iterator = typeof (rows as Partial<AsyncIterable<Row>>)[Symbol.asyncIterator] === 'function' ?
      (rows as AsyncIterable<Row>)[Symbol.asyncIterator]() :
      (rows as Iterable<Row>)[Symbol.iterator]();

    // The first row is requested now, before the `INSERT BULK` statement
    // has gone out. For a stream source this is what attaches its
    // iterator's listeners: an error it emits while the statement is in
    // flight is kept and reported on the next read, instead of being an
    // unhandled `'error'` event. The read is awaited when the rows are
    // serialized; its rejection is not unhandled until then, and neither
    // is a synchronous source's throw, which reaches the bulk load's
    // callback the same way.
    let first: IteratorResult<Row> | Promise<IteratorResult<Row>>;
    try {
      first = this.iterator.next();
    } catch (err) {
      first = Promise.reject(err);
    }

    if (isPromiseLike(first)) {
      const read = Promise.resolve(first);
      read.then(undefined, ignoreError);
      this.pending = read;
    } else {
      this.pending = first;
    }
  }

  /**
   * Closes the row source of a bulk load whose rows will not be read:
   * the `INSERT BULK` statement was rejected, the bulk load was canceled,
   * or the connection is no longer logged in. Best effort: a read still
   * pending in the source cannot be interrupted, and a close that fails
   * has nothing left to report to.
   */
  close() {
    const iterator = this.iterator;
    if (typeof iterator.return !== 'function') {
      return;
    }

    try {
      const closing = iterator.return();
      if (isPromiseLike(closing)) {
        Promise.resolve(closing).then(undefined, ignoreError);
      }
    } catch {
      // Nothing left to report to.
    }
  }

  async *[Symbol.asyncIterator]() {
    const bulkLoad = this.bulkLoad;
    const options = bulkLoad.options;
    const columns = bulkLoad.columns;
    const iterator = this.iterator;

    // Per column, not per cell: a text type's value is written behind a
    // text pointer and timestamp, or as a null pointer.
    const isTextType = columns.map((c) => c.type.name === 'Text' || c.type.name === 'Image' || c.type.name === 'NText');

    const buffer = new WritableTrackingBuffer();
    buffer.writeBuffer(bulkLoad.getColMetaData());

    let done = false;
    let closed = false;
    try {
      while (true) {
        let result = this.pending ?? iterator.next();
        this.pending = undefined;
        if (isPromiseLike(result)) {
          result = await result;
        }

        if (result.done) {
          done = true;
          break;
        }

        // A row given as a promise is settled first, as `Readable.from`
        // settled it before handing it on.
        let row = result.value;
        if (isPromiseLike(row)) {
          row = await row;
        }

        buffer.writeBuffer(rowTokenBuffer);

        const isArray = Array.isArray(row);
        for (let i = 0; i < columns.length; i++) {
          const c = columns[i];
          const value = c.type.validate(isArray ? (row as unknown[])[i] : (row as { [colName: string]: unknown })[c.objName], c.collation);

          const parameter = {
            length: c.length,
            scale: c.scale,
            precision: c.precision,
            value: value
          };

          if (isTextType[i] && value == null) {
            buffer.writeBuffer(textPointerNullBuffer);
          } else {
            if (isTextType[i]) {
              buffer.writeBuffer(textPointerAndTimestampBuffer);
            }

            writeValue(c.type, buffer, parameter, options);
          }

          // Checked after every cell, not only after every row, so that a
          // wide row of large cells goes downstream as it is serialized.
          if (buffer.length >= WritableTrackingBuffer.CHUNK_SIZE) {
            for (const chunk of buffer.getBuffers()) {
              yield chunk;
            }
            buffer.consume(buffer.length);
          }
        }
      }
    } catch (err) {
      // A failed row closes the source as a `for await` would. A close
      // that fails must not replace the row error the bulk load is
      // failing with.
      closed = true;
      if (typeof iterator.return === 'function') {
        try {
          await iterator.return();
        } catch {
          // The row error is what surfaces.
        }
      }
      throw err;
    } finally {
      // The consumer stopped pulling (e.g. because the bulk load was
      // canceled): close the source as a `for await` would.
      if (!done && !closed && typeof iterator.return === 'function') {
        await iterator.return();
      }
    }

    buffer.writeBuffer(bulkLoad.createDoneToken());
    for (const chunk of buffer.getBuffers()) {
      yield chunk;
    }
    buffer.consume(buffer.length);
  }

  toString(indent = '') {
    return indent + ('BulkLoad');
  }
}
