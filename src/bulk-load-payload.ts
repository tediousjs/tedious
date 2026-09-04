import BulkLoad, { type Row } from './bulk-load';

function ignoreError() {}

export class BulkLoadPayload implements AsyncIterable<Buffer> {
  declare bulkLoad: BulkLoad;
  declare iterator: AsyncGenerator<Buffer, void, undefined>;

  constructor(bulkLoad: BulkLoad, rows: Iterable<Row> | AsyncIterable<Row>) {
    this.bulkLoad = bulkLoad;

    // A `Readable` (or another event-emitting source) attaches its own
    // error handling only once it is iterated, which does not happen
    // before the `INSERT BULK` statement has been accepted. An `'error'`
    // it emits in the meantime would be unhandled and crash the process.
    // With a listener in place the stream keeps the error, and iterating
    // it later rejects with it, so it still reaches the bulk load's
    // callback.
    const source = rows as { on?: (event: string, listener: () => void) => void };
    if (typeof source.on === 'function') {
      source.on('error', ignoreError);
    }

    // The generator does not run, and no row is read, until it is pulled.
    this.iterator = bulkLoad.serializeRows(rows);
  }

  [Symbol.asyncIterator]() {
    return this.iterator;
  }

  toString(indent = '') {
    return indent + ('BulkLoad');
  }
}
