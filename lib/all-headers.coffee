# s2.2.5.3

# For now, only the "Transaction Descriptor" header (s2.2.5.3.2) is supported.

TYPE =
  QUERY_NOTIFICATIONS: 1
  TXN_DESCRIPTOR: 2
  TRACE_ACTIVITY: 3

TXNDESCRIPTOR_HEADER_DATA_LEN = 4 + 8
TXNDESCRIPTOR_HEADER_LEN = 4 + 2 + TXNDESCRIPTOR_HEADER_DATA_LEN

module.exports = (txnDescriptor, outstandingRequestCount) ->
  
  buffer = new Buffer(4 + (4 + 2 + TXNDESCRIPTOR_HEADER_DATA_LEN))
  
  position = 0

  buffer.writeUInt32LE(buffer.length, position)
  position += 4
  
  buffer.writeUInt32LE(TXNDESCRIPTOR_HEADER_LEN, position)
  position += 4
  
  buffer.writeUInt16LE(TYPE.TXN_DESCRIPTOR, position)
  position += 2
  
  buffer.writeUInt32LE(txnDescriptor % 0x100000000, position)
  position += 4
  
  buffer.writeUInt32LE(txnDescriptor / 0x100000000, position)
  position += 4
  
  buffer.writeUInt32LE(outstandingRequestCount, position)
  position += 4
  
  buffer