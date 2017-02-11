'use strict';

var TYPE = {
  QUERY_NOTIFICATIONS: 1,
  TXN_DESCRIPTOR: 2,
  TRACE_ACTIVITY: 3
};

var TXNDESCRIPTOR_HEADER_DATA_LEN = 4 + 8;

var TXNDESCRIPTOR_HEADER_LEN = 4 + 2 + TXNDESCRIPTOR_HEADER_DATA_LEN;

module.exports.writeToTrackingBuffer = writeToTrackingBuffer;
function writeToTrackingBuffer(buffer, txnDescriptor, outstandingRequestCount) {
  buffer.writeUInt32LE(0);
  buffer.writeUInt32LE(TXNDESCRIPTOR_HEADER_LEN);
  buffer.writeUInt16LE(TYPE.TXN_DESCRIPTOR);
  buffer.writeBuffer(txnDescriptor);
  buffer.writeUInt32LE(outstandingRequestCount);

  var data = buffer.data;
  data.writeUInt32LE(data.length, 0);
  return buffer;
}