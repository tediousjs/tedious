import { EventEmitter } from 'events';
import BulkLoad from './bulk-load';

type Row = unknown[] | { [colName: string]: unknown };

function ignoreError() {}

export class BulkLoadPayload implements AsyncIterable<Buffer> {
  declare bulkLoad: BulkLoad;
  declare rows: Iterable<Row> | AsyncIterable<Row>;

  constructor(bulkLoad: BulkLoad, rows: Iterable<Row> | AsyncIterable<Row>) {
    this.bulkLoad = bulkLoad;
    this.rows = rows;

    // A stream source that fails while the `INSERT BULK` statement is in
    // flight, before anything reads from it, would emit an unhandled
    // `'error'` event; with a listener it keeps the error for its iterator
    // instead. The listener comes off once the rows are read and the
    // iterator has its own.
    if (rows instanceof EventEmitter) {
      rows.on('error', ignoreError);
    }
  }

  async *[Symbol.asyncIterator]() {
    const rows = this.rows;

    if (rows instanceof EventEmitter) {
      rows.removeListener('error', ignoreError);
    }

    yield* this.bulkLoad.serializeRows(rows);
  }

  toString(indent = '') {
    return indent + ('BulkLoad');
  }
}
