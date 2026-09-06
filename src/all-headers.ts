import WritableTrackingBuffer from './tracking-buffer/writable-tracking-buffer';

const TYPE = {
  QUERY_NOTIFICATIONS: 1,
  TXN_DESCRIPTOR: 2,
  TRACE_ACTIVITY: 3
};

const TXNDESCRIPTOR_HEADER_DATA_LEN = 4 + 8;

const TXNDESCRIPTOR_HEADER_LEN = 4 + 2 + TXNDESCRIPTOR_HEADER_DATA_LEN;

const ALL_HEADERS_LEN = 4 + TXNDESCRIPTOR_HEADER_LEN;

export function writeToTrackingBuffer(buffer: WritableTrackingBuffer, txnDescriptor: Buffer, outstandingRequestCount: number) {
  // TotalLength
  buffer.writeUInt32LE(ALL_HEADERS_LEN);
  buffer.writeUInt32LE(TXNDESCRIPTOR_HEADER_LEN);
  buffer.writeUInt16LE(TYPE.TXN_DESCRIPTOR);
  buffer.writeBuffer(txnDescriptor);
  buffer.writeUInt32LE(outstandingRequestCount);
  return buffer;
}
