import WritableTrackingBuffer from './tracking-buffer/writable-tracking-buffer';
import { writeToTrackingBuffer } from './all-headers';

/*
  s2.2.6.6
 */
class SqlBatchPayload implements Iterable<Buffer> {
  sqlText: string;
  txnDescriptor: Buffer;
  options: { tdsVersion: string };

  constructor(sqlText: string, txnDescriptor: Buffer, options: { tdsVersion: string }) {
    this.sqlText = sqlText;
    this.txnDescriptor = txnDescriptor;
    this.options = options;
  }

  *[Symbol.iterator]() {
    if (this.options.tdsVersion >= '7_2') {
      const buffer = new WritableTrackingBuffer(18, 'ucs2');
      const outstandingRequestCount = 1;

      writeToTrackingBuffer(buffer, this.txnDescriptor, outstandingRequestCount);

      yield buffer.data;
    }

    yield Buffer.from(this.sqlText, 'ucs2');
  }

  toString(indent = '') {
    return indent + ('SQL Batch - ' + this.sqlText);
  }
}

export default SqlBatchPayload;
module.exports = SqlBatchPayload;
