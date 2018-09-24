// @flow

const WritableTrackingBuffer = require('./tracking-buffer/writable-tracking-buffer');
const writeAllHeaders = require('./all-headers').writeToTrackingBuffer;

/*
  s2.2.6.6
 */
class SqlBatchPayload {
  sqlText: string;
  data: Buffer;

  constructor(sqlText: string, txnDescriptor: Buffer, options: { tdsVersion: string }) {
    this.sqlText = sqlText;

    const buffer = new WritableTrackingBuffer(100 + 2 * this.sqlText.length, 'ucs2');
    if (options.tdsVersion >= '7_2') {
      const outstandingRequestCount = 1;
      writeAllHeaders(buffer, txnDescriptor, outstandingRequestCount);
    }
    buffer.writeString(this.sqlText, 'ucs2');
    this.data = buffer.data;
  }

  toString(indent: string = '') {
    return indent + ('SQL Batch - ' + this.sqlText);
  }
}

module.exports = SqlBatchPayload;
