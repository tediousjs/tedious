require('../buffertools')

###
  A Buffer-like class that tracks position.

  As values are read, the position advances by the size of the read data.

  The read data is passed to a callback. If there is sufficient data buffered, then
  the callback is called immediately. If there is insufficient data, the callback
  is not called until there is enough data.
###
class ReadableTrackingBuffer
  constructor: (@buffer) ->
    if !buffer
      @buffer = new Buffer(0)
      @encoding = undefined

    @position = 0

  add: (buffer) ->
    @buffer = @buffer.slice(@position).concat(buffer)
    @position = 0

    if @waiting && @isEnoughLeftFor(@waiting.length)
      @read.apply(@, @waiting.readArguments)
      @waiting = undefined

  isEnoughLeftFor: (required) ->
    available = @buffer.length - @position
    available >= required

  read: (length, readValueFunction, callback) ->
    if @isEnoughLeftFor(length)
      value = readValueFunction.call(@)
      @position += length
      callback(value)
    else
      @waiting =
        length: length
        readArguments: arguments

  readUInt16LE: (callback) ->
    length = 2
    readValueFunction = ->
      @buffer.readUInt16LE(@position)

    @read(length, readValueFunction, callback)

  readBuffer: (length, callback) ->
    readValueFunction = ->
      @buffer.slice(@position, @position + length)

    @read(length, readValueFunction, callback)

module.exports = ReadableTrackingBuffer
