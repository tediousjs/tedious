createAllHeaders = require('./all-headers')

###
  s2.2.6.6
###
class SqlBatchPayload
  constructor: (@sqlText) ->
    txnDescriptor = 0
    outstandingRequestCount = 1

    allHeaders = createAllHeaders(txnDescriptor, outstandingRequestCount)

    buffer = new Buffer(allHeaders.length + (2 * @sqlText.length))
    allHeaders.copy(buffer)
    buffer.write(@sqlText, allHeaders.length, 'ucs2')
    
    @data = buffer

  toString: (indent) ->
    indent ||= ''
    indent + "SQL Batch - #{@sqlText}"

module.exports = SqlBatchPayload
