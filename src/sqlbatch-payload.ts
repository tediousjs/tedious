import WritableTrackingBuffer from './tracking-buffer/writable-tracking-buffer';
import { writeToTrackingBuffer } from './all-headers';

/*
  s2.2.6.6
 */
class SqlBatchPayload {
  sqlText: string;
  txnDescriptor: Buffer;
  options: { tdsVersion: string };

  constructor(sqlText: string, txnDescriptor: Buffer, options: { tdsVersion: string }) {
    this.sqlText = sqlText;
    this.txnDescriptor = txnDescriptor;
    this.options = options;
  }

  getData(cb: (data: Buffer) => void) {
    const buffer = new WritableTrackingBuffer(100 + 2 * this.sqlText.length, 'ucs2');
    if (this.options.tdsVersion >= '7_2') {
      const outstandingRequestCount = 1;
      writeToTrackingBuffer(buffer, this.txnDescriptor, outstandingRequestCount);
    }
    buffer.writeString(this.sqlText, 'ucs2');
    cb(buffer.data);
  }

  toString(indent: string = '') {
    return indent + ('SQL Batch - ' + this.sqlText);
  }
}

export default SqlBatchPayload;
module.exports = SqlBatchPayload;
