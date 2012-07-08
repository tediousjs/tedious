WritableTrackingBuffer = require('./tracking-buffer/writable-tracking-buffer')
writeAllHeaders = require('./all-headers').writeToTrackingBuffer

###
  s2.2.6.8
###

OPERATION_TYPE =
  TM_GET_DTC_ADDRESS: 0x00
  TM_PROPAGATE_XACT: 0x01
  TM_BEGIN_XACT: 0x05
  TM_PROMOTE_XACT: 0x06
  TM_COMMIT_XACT: 0x07
  TM_ROLLBACK_XACT: 0x08
  TM_SAVE_XACT: 0x09

ISOLATION_LEVEL =
  NO_CHANGE: 0x00
  READ_UNCOMMITTED: 0x01
  READ_COMMITTED: 0x02
  REPEATABLE_READ: 0x03
  SERIALIZABLE: 0x04
  SNAPSHOT: 0x05

isolationLevelByValue = {}
for name, value of ISOLATION_LEVEL
  isolationLevelByValue[value] = name

class Transaction
  constructor: (@name, @isolationLevel) ->
    @outstandingRequestCount = 1

  beginPayload: (txnDescriptor) ->
    buffer = new WritableTrackingBuffer(100, 'ucs2')
    writeAllHeaders(buffer, txnDescriptor, @outstandingRequestCount)
    buffer.writeUShort(OPERATION_TYPE.TM_BEGIN_XACT)
    buffer.writeUInt8(@isolationLevel)
    buffer.writeUInt8(@name.length * 2)
    buffer.writeString(@name, 'ucs2')

    payload =
      data: buffer.data
      toString: =>
        "Begin Transaction: name=#{@name}, isolationLevel=#{isolationLevelByValue[@isolationLevel]}"

  commitPayload: (txnDescriptor) ->
    buffer = new WritableTrackingBuffer(100, 'ascii')
    writeAllHeaders(buffer, txnDescriptor, @outstandingRequestCount)
    buffer.writeUShort(OPERATION_TYPE.TM_COMMIT_XACT)
    buffer.writeUInt8(@name.length * 2)
    buffer.writeString(@name, 'ucs2')
    buffer.writeUInt8(0)         # No fBeginXact flag, so no new transaction is started.

    payload =
      data: buffer.data
      toString: =>
        "Commit Transaction: name=#{@name}"

  rollbackPayload: (txnDescriptor) ->
    buffer = new WritableTrackingBuffer(100, 'ascii')
    writeAllHeaders(buffer, txnDescriptor, @outstandingRequestCount)
    buffer.writeUShort(OPERATION_TYPE.TM_ROLLBACK_XACT)
    buffer.writeUInt8(@name.length * 2)
    buffer.writeString(@name, 'ucs2')
    buffer.writeUInt8(0)         # No fBeginXact flag, so no new transaction is started.

    payload =
      data: buffer.data
      toString: =>
        "Rollback Transaction: name=#{@name}"

exports.Transaction = Transaction
exports.ISOLATION_LEVEL = ISOLATION_LEVEL
