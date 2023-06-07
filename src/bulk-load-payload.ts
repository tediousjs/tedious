import BulkLoad from './bulk-load';

export class BulkLoadPayload implements AsyncIterable<Buffer> {
  bulkLoad: BulkLoad;
  iterator: AsyncIterableIterator<Buffer>;

  constructor(bulkLoad: BulkLoad) {
    this.bulkLoad = bulkLoad;

    // We need to grab the iterator here so that `error` event handlers are set up
    // as early as possible (and are not potentially lost).
    this.iterator = this.bulkLoad.rowToPacketTransform[Symbol.asyncIterator]();
  }

  [Symbol.asyncIterator]() {
    return this.iterator;
  }

  toString(indent = '') {
    return indent + ('BulkLoad');
  }
}
