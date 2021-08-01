import BulkLoad from './bulk-load';
import { RequestError } from './errors';

export class BulkLoadPayload implements AsyncIterable<Buffer> {
  bulkLoad: BulkLoad;
  iterator: AsyncIterableIterator<Buffer>;

  constructor(bulkLoad: BulkLoad) {
    this.bulkLoad = bulkLoad;

    // We need to grab the iterator here so that `error` event handlers are set up
    // as early as possible (and are not potentially lost).
    this.iterator = this.bulkLoad.rowToPacketTransform[Symbol.asyncIterator]();

    this.bulkLoad.rowToPacketTransform.once('finish', () => {
      this.bulkLoad.removeListener('cancel', onCancel);
    });

    let onCancel: () => void;
    if (this.bulkLoad.streamingMode) {
      onCancel = () => {
        this.bulkLoad.rowToPacketTransform.destroy(new RequestError('Canceled.', 'ECANCEL'));
      };
    } else {
      onCancel = () => {
        this.bulkLoad.rowToPacketTransform.destroy();
      };
    }

    this.bulkLoad.once('cancel', onCancel);
  }

  [Symbol.asyncIterator]() {
    return this.iterator;
  }

  toString(indent = '') {
    return indent + ('BulkLoad');
  }
}
