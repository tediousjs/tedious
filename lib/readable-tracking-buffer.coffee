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
    @position = 0    

  add: (buffer) ->
    @buffer = @buffer.slice(@position).concat(buffer)
    @position = 0

  enoughLeftFor: (lengthRequired) ->
    @buffer.length - @position >= lengthRequired

  readUInt8: ->
    length = 1
    if !@enoughLeftFor(length)
      null
    else
      @position += length
      value = @buffer.readUInt8(@position - length)

  readUInt16LE: ->
    length = 2
    if !@enoughLeftFor(length)
      null
    else
      @position += length
      @buffer.readUInt16LE(@position - length)

  readUInt16BE: ->
    length = 2
    if !@enoughLeftFor(length)
      null
    else
      @position += length
      @buffer.readUInt16BE(@position - length)

  readUInt32LE: ->
    length = 4
    if !@enoughLeftFor(length)
      null
    else
      @position += length
      @buffer.readUInt32LE(@position - length)

  readUInt32BE: ->
    length = 4
    if !@enoughLeftFor(length)
      null
    else
      @position += length
      @buffer.readUInt32BE(@position - length)

  readInt8: ->
    length = 1
    if !@enoughLeftFor(length)
      null
    else
      @position += length
      value = @buffer.readInt8(@position - length)

  readInt16LE: ->
    length = 2
    if !@enoughLeftFor(length)
      null
    else
      @position += length
      @buffer.readInt16LE(@position - length)

  readInt16BE: ->
    length = 2
    if !@enoughLeftFor(length)
      null
    else
      @position += length
      @buffer.readInt16BE(@position - length)

  readInt32LE: ->
    length = 4
    if !@enoughLeftFor(length)
      null
    else
      @position += length
      @buffer.readInt32LE(@position - length)

  readInt32BE: ->
    length = 4
    if !@enoughLeftFor(length)
      null
    else
      @position += length
      @buffer.readInt32BE(@position - length)

  readString: (length) ->
    if !@enoughLeftFor(length)
      null
    else
      @position += length
      @buffer.toString(@encoding, @position - length, @position)

module.exports = ReadableTrackingBuffer
