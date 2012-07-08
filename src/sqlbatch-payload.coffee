WritableTrackingBuffer = require('./tracking-buffer/tracking-buffer').WritableTrackingBuffer
writeAllHeaders = require('./all-headers').writeToTrackingBuffer

###
  s2.2.6.6
###
class SqlBatchPayload
  constructor: (@sqlText, txnDescriptor) ->
    outstandingRequestCount = 1

    buffer = new WritableTrackingBuffer(100 + (2 * @sqlText.length), 'ucs2')
    writeAllHeaders(buffer, txnDescriptor, outstandingRequestCount)
    buffer.writeString(@sqlText, 'ucs2')

    @data = buffer.data

  toString: (indent) ->
    indent ||= ''
    indent + "SQL Batch - #{@sqlText}"

module.exports = SqlBatchPayload
