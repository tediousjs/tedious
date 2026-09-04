import BulkLoad from './bulk-load';

type Row = unknown[] | { [colName: string]: unknown };

export class BulkLoadPayload implements AsyncIterable<Buffer> {
  declare bulkLoad: BulkLoad;
  declare rows: Iterable<Row> | AsyncIterable<Row>;

  constructor(bulkLoad: BulkLoad, rows: Iterable<Row> | AsyncIterable<Row>) {
    this.bulkLoad = bulkLoad;
    this.rows = rows;
  }

  [Symbol.asyncIterator]() {
    return this.bulkLoad.serializeRows(this.rows);
  }

  toString(indent = '') {
    return indent + ('BulkLoad');
  }
}
