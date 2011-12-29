# s2.2.5.3

# For now, only the "Transaction Descriptor" header (s2.2.5.3.2) is supported.

WritableTrackingBuffer = require('../lib/tracking-buffer/tracking-buffer').WritableTrackingBuffer

TYPE =
  QUERY_NOTIFICATIONS: 1
  TXN_DESCRIPTOR: 2
  TRACE_ACTIVITY: 3

TXNDESCRIPTOR_HEADER_DATA_LEN = 4 + 8
TXNDESCRIPTOR_HEADER_LEN = 4 + 2 + TXNDESCRIPTOR_HEADER_DATA_LEN

module.exports = (txnDescriptor, outstandingRequestCount) ->
  buffer = new WritableTrackingBuffer(50)

  buffer.writeUInt32LE(0)                             # Will write buffer length in here later.
  buffer.writeUInt32LE(TXNDESCRIPTOR_HEADER_LEN)
  buffer.writeUInt16LE(TYPE.TXN_DESCRIPTOR)
  buffer.writeUInt32LE(txnDescriptor % 0x100000000)
  buffer.writeUInt32LE(txnDescriptor / 0x100000000)
  buffer.writeUInt32LE(outstandingRequestCount)

  data = buffer.data

  # Write deferred buffer length.
  data.writeUInt32LE(data.length, 0)

  data
