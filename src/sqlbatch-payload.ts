import WritableTrackingBuffer from './tracking-buffer/writable-tracking-buffer';
import { writeToTrackingBuffer } from './all-headers';
import { Readable } from 'readable-stream';

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

  getStream() {
    const { sqlText, txnDescriptor, options: { tdsVersion } } = this;

    return new Readable({
      read() {
        if (tdsVersion >= '7_2') {
          const buffer = new WritableTrackingBuffer(18, 'ucs2');
          const outstandingRequestCount = 1;

          writeToTrackingBuffer(buffer, txnDescriptor, outstandingRequestCount);

          this.push(buffer.data);
        }

        this.push(sqlText, 'ucs2');

        this.push(null);
      }
    });
  }

  toString(indent = '') {
    return indent + ('SQL Batch - ' + this.sqlText);
  }
}

export default SqlBatchPayload;
module.exports = SqlBatchPayload;
