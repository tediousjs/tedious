import { WritableTrackingBuffer } from './tracking-buffer/tracking-buffer';
import { writeToTrackingBuffer as writeAllHeaders } from './all-headers';

/*
  s2.2.6.6
 */
export default class SqlBatchPayload {
  constructor(sqlText, txnDescriptor, options) {
    this.sqlText = sqlText;

    const buffer = new WritableTrackingBuffer(100 + 2 * this.sqlText.length, 'ucs2');
    if (options.tdsVersion >= '7_2') {
      const outstandingRequestCount = 1;
      writeAllHeaders(buffer, txnDescriptor, outstandingRequestCount);
    }
    buffer.writeString(this.sqlText, 'ucs2');
    this.data = buffer.data;
  }

  toString(indent) {
    indent || (indent = '');
    return indent + ("SQL Batch - " + this.sqlText);
  }
}
