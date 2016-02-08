'use strict';

const WritableTrackingBuffer = require('./tracking-buffer/tracking-buffer').WritableTrackingBuffer;
const writeAllHeaders = require('./all-headers').writeToTrackingBuffer;

/*
  s2.2.6.6
 */
module.exports = class SqlBatchPayload {
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
    return indent + ('SQL Batch - ' + this.sqlText);
  }
};
