WritableTrackingBuffer = require('./tracking-buffer/tracking-buffer').WritableTrackingBuffer
writeAllHeaders = require('./all-headers').writeToTrackingBuffer

###
  s2.2.6.6
###
class SqlBatchPayload
  constructor: (@sqlText, txnDescriptor, options) ->
    buffer = new WritableTrackingBuffer(100 + (2 * @sqlText.length), 'ucs2')
    
    if options.tdsVersion >= '7_2'
      outstandingRequestCount = 1
      writeAllHeaders(buffer, txnDescriptor, outstandingRequestCount)
    
    buffer.writeString(@sqlText, 'ucs2')

    @data = buffer.data

  toString: (indent) ->
    indent ||= ''
    indent + "SQL Batch - #{@sqlText}"

module.exports = SqlBatchPayload
