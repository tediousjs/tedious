bigint = require('./bigint')
buffertools = require('../buffertools')

SHIFT_LEFT_32 = (1 << 16) * (1 << 16)
SHIFT_RIGHT_32 = 1 / SHIFT_LEFT_32

###
  A Buffer-like class that tracks position.

  As values are written, the position advances by the size of the written data.
  When writing, automatically allocates new buffers if there's not enough space.
###
class WritableTrackingBuffer
  constructor: (@initialSize, @encoding, @doubleSizeGrowth) ->
    @doubleSizeGrowth ||= false
    @encoding ||= 'ucs2'

    @buffer = new Buffer(@initialSize)
    @position = 0

    @.__defineGetter__("data", ->
      @newBuffer(0)

      @compositeBuffer
    )

  copyFrom: (buffer) ->
    length = buffer.length
    @makeRoomFor(length)
    buffer.copy(@buffer, @position)
    @position += length

  makeRoomFor: (requiredLength) ->
    if @buffer.length - @position < requiredLength
      if @doubleSizeGrowth 
        size = @buffer.length * 2
        while (size < requiredLength)
          size *= 2
        @newBuffer(size)
      else 
        @newBuffer(requiredLength)

  newBuffer: (size) ->
    size ||= @initialSize

    buffer = @buffer.slice(0, @position)

    if @compositeBuffer
      @compositeBuffer = Buffer.concat([@compositeBuffer, buffer])
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

  writeUShort: (value) ->
    @writeUInt16LE(value)

  writeUInt16BE: (value) ->
    length = 2
    @makeRoomFor(length)
    @buffer.writeUInt16BE(value, @position)
    @position += length
  
  writeUInt24LE: (value) ->
    length = 3
    @makeRoomFor(length)
    @buffer[@position + 2] = (value >>> 16) & 0xff;
    @buffer[@position + 1] = (value >>> 8) & 0xff;
    @buffer[@position] = value & 0xff;
    @position += length

  writeUInt32LE: (value) ->
    length = 4
    @makeRoomFor(length)
    @buffer.writeUInt32LE(value, @position)
    @position += length

  writeUInt64LE: (value) ->
    low = value % 0x100000000
    high = Math.floor(value / 0x100000000)
    @writeUInt32LE(low)
    @writeUInt32LE(high)
  
  writeInt64LE: (value) ->
    buf = bigint.numberToInt64LE(value);
    @copyFrom(buf)

  writeUInt32BE: (value) ->
    length = 4
    @makeRoomFor(length)
    @buffer.writeUInt32BE(value, @position)
    @position += length
  
  writeUInt40LE: (value) ->
    # inspred by https://github.com/dpw/node-buffer-more-ints
    @writeInt32LE value & -1
    @writeUInt8 Math.floor(value * SHIFT_RIGHT_32)
  
  writeUInt64LE: (value) ->
    @writeInt32LE value & -1
    @writeUInt32LE Math.floor(value * SHIFT_RIGHT_32)
  
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
  
  writeFloatLE: (value) ->
    length = 4
    @makeRoomFor(length)
    @buffer.writeFloatLE(value, @position)
    @position += length
  
  writeDoubleLE: (value) ->
    length = 8
    @makeRoomFor(length)
    @buffer.writeDoubleLE(value, @position)
    @position += length

  writeString: (value, encoding) ->
    encoding ||= @encoding

    length = Buffer.byteLength(value, encoding)
    @makeRoomFor(length)
    bytesWritten = @buffer.write(value, @position, encoding)
    @position += length

    bytesWritten

  writeBVarchar: (value, encoding) ->
    @writeUInt8(value.length)
    @writeString(value, encoding)

  writeUsVarchar: (value, encoding) ->
    @writeUInt16LE(value.length)
    @writeString(value, encoding)
  
  writeUsVarbyte: (value, encoding = @encoding) ->
    if Buffer.isBuffer value
      length = value.length
    else
      value = value.toString()
      length = Buffer.byteLength value, encoding
      
    @writeUInt16LE length
    
    if Buffer.isBuffer value
      @writeBuffer value
    else
      @makeRoomFor length
      @buffer.write(value, @position, encoding)
      @position += length

  writePLPBody: (value, encoding = @encoding) ->
    if Buffer.isBuffer value
      length = value.length
    else
      value = value.toString()
      length = Buffer.byteLength value, encoding
    
    # Length of all chunks.
    @writeUInt64LE length
    
    # One chunk.
    @writeUInt32LE length
    
    if Buffer.isBuffer value
      @writeBuffer value
    else
      @makeRoomFor length
      @buffer.write value, @position, encoding
      @position += length

    # PLP_TERMINATOR (no more chunks).
    @writeUInt32LE(0)

  writeBuffer: (value) ->
    length = value.length
    @makeRoomFor(length)
    value.copy(@buffer, @position)
    @position += length
  
  writeMoney: (value) ->
    @writeInt32LE Math.floor(value * SHIFT_RIGHT_32)
    @writeInt32LE value & -1

module.exports = WritableTrackingBuffer
