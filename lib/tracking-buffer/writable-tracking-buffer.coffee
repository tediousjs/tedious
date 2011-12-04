buffertools = require('buffertools')

###
  A Buffer-like class that tracks position.

  As values are written, the position advances by the size of the written data.
  When writing, automatically allocates new buffers if there's not enough space.
###
class WritableTrackingBuffer
  constructor: (@sizeIncrement, @encoding) ->
    @encoding ||= 'utf8'

    @buffer = new Buffer(@sizeIncrement)
    @position = 0

    @.__defineGetter__("data", ->
      @newBuffer(0)

      @compositeBuffer
    )

  makeRoomFor: (requiredLength) ->
    if @buffer.length - @position < requiredLength
      @newBuffer(requiredLength)

  newBuffer: (size) ->
    size ||= @sizeIncrement
    
    buffer = @buffer.slice(0, @position)
    
    if @compositeBuffer
      @compositeBuffer = @compositeBuffer.concat(buffer)
    else
      @compositeBuffer = buffer

    @buffer = new Buffer(size)
    @position = 0

  writeUInt8: (value) ->
    length = 1
    @makeRoomFor(length)
    @buffer.writeUInt8(value, @position)
    @position += length

  writeUInt16LE: (value) ->
    length = 2
    @makeRoomFor(length)
    @buffer.writeUInt16LE(value, @position)
    @position += length

  writeUInt16BE: (value) ->
    length = 2
    @makeRoomFor(length)
    @buffer.writeUInt16BE(value, @position)
    @position += length

  writeUInt32LE: (value) ->
    length = 4
    @makeRoomFor(length)
    @buffer.writeUInt32LE(value, @position)
    @position += length

  writeUInt32BE: (value) ->
    length = 4
    @makeRoomFor(length)
    @buffer.writeUInt32BE(value, @position)
    @position += length

  writeInt8: (value) ->
    length = 1
    @makeRoomFor(length)
    @buffer.writeInt8(value, @position)
    @position += length

  writeInt16LE: (value) ->
    length = 2
    @makeRoomFor(length)
    @buffer.writeInt16LE(value, @position)
    @position += length

  writeInt16BE: (value) ->
    length = 2
    @makeRoomFor(length)
    @buffer.writeInt16BE(value, @position)
    @position += length

  writeInt32LE: (value) ->
    length = 4
    @makeRoomFor(length)
    @buffer.writeInt32LE(value, @position)
    @position += length

  writeInt32BE: (value) ->
    length = 4
    @makeRoomFor(length)
    @buffer.writeInt32BE(value, @position)
    @position += length

  writeString: (value) ->
    length = Buffer.byteLength(value, @encoding)
    @makeRoomFor(length)
    bytesWritten = @buffer.write(value, @position, @encoding)
    @position += length

module.exports = WritableTrackingBuffer
