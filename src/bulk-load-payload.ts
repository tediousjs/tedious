import BulkLoad from './bulk-load';
import { RequestError } from './errors';

export class BulkLoadPayload implements AsyncIterable<Buffer> {
  bulkLoad: BulkLoad;
  iterator: AsyncIterator<Buffer>;

  constructor(bulkLoad: BulkLoad) {
    this.bulkLoad = bulkLoad;

    this.iterator = this.bulkLoad.rowToPacketTransform[Symbol.asyncIterator]();
  }

  [Symbol.asyncIterator]() {
    if (this.bulkLoad.canceled) {
      this.bulkLoad.rowToPacketTransform.destroy(new RequestError('Canceled.', 'ECANCEL'));
    } else {
      this.bulkLoad.rowToPacketTransform.once('finish', () => {
        this.bulkLoad.removeListener('cancel', onCancel);
      });

      const onCancel = () => {
        this.bulkLoad.rowToPacketTransform.destroy(new RequestError('Canceled.', 'ECANCEL'));
      };

      this.bulkLoad.once('cancel', onCancel);
    }

    return this.iterator;
  }

  toString(indent = '') {
    return indent + ('BulkLoad');
  }
}
