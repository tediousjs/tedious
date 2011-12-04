buffertools = require('buffertools')

###
  A Buffer-like class that tracks position.

  As values are read, the position advances by the size of the read data.
  When reading, if the read would pass the end of the buffer, null is returned.
###
class ReadableTrackingBuffer
  constructor: (@buffer, @encoding) ->
    if !buffer
      @buffer = new Buffer(0)
      @encoding = undefined

    @encoding ||= 'utf8'    

module.exports = ReadableTrackingBuffer
