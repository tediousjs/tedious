convertLEBytesToString= require('./bigint').convertLEBytesToString

###
  A Buffer-like class that tracks position.

  As values are read, the position advances by the size of the read data.
  When reading, if the read would pass the end of the buffer, an error object is thrown.
###
class ReadableTrackingBuffer
  constructor: (@buffer, @encoding) ->
    if !buffer
      @buffer = new Buffer(0)
      @encoding = undefined

    @encoding ||= 'utf8'
    @position = 0

  add: (buffer) ->
    @buffer = Buffer.concat([@buffer.slice(@position), buffer])
    @position = 0

  assertEnoughLeftFor: (lengthRequired) ->
    @previousPosition = @position

    available = @buffer.length - @position

    if available < lengthRequired
      throw
        error: 'oob'
        message: "required : #{lengthRequired}, available : #{available}"

  empty: ->
    @position == @buffer.length

  rollback: ->
    @position = @previousPosition

  readUInt8: ->
    length = 1
    @assertEnoughLeftFor(length)
    @position += length
    value = @buffer.readUInt8(@position - length)

  readUInt16LE: ->
    length = 2
    @assertEnoughLeftFor(length)
    @position += length
    @buffer.readUInt16LE(@position - length)

  readUInt16BE: ->
    length = 2
    @assertEnoughLeftFor(length)
    @position += length
    @buffer.readUInt16BE(@position - length)

  readUInt32LE: ->
    length = 4
    @assertEnoughLeftFor(length)
    @position += length
    @buffer.readUInt32LE(@position - length)

  readUInt32BE: ->
    length = 4
    @assertEnoughLeftFor(length)
    @position += length
    @buffer.readUInt32BE(@position - length)

  readInt8: ->
    length = 1
    @assertEnoughLeftFor(length)
    @position += length
    value = @buffer.readInt8(@position - length)

  readInt16LE: ->
    length = 2
    @assertEnoughLeftFor(length)
    @position += length
    @buffer.readInt16LE(@position - length)

  readInt16BE: ->
    length = 2
    @assertEnoughLeftFor(length)
    @position += length
    @buffer.readInt16BE(@position - length)

  readInt32LE: ->
    length = 4
    @assertEnoughLeftFor(length)
    @position += length
    @buffer.readInt32LE(@position - length)

  readInt32BE: ->
    length = 4
    @assertEnoughLeftFor(length)
    @position += length
    @buffer.readInt32BE(@position - length)

  readFloatLE: ->
    length = 4
    @assertEnoughLeftFor(length)
    @position += length
    @buffer.readFloatLE(@position - length)

  readDoubleLE: ->
    length = 8
    @assertEnoughLeftFor(length)
    @position += length
    @buffer.readDoubleLE(@position - length)

  # If value > 53 bits then it will be incorrect (because Javascript uses IEEE_754 for number representation).
  readUInt64LE: ->
    low = @readUInt32LE()
    high = @readUInt32LE()
    if (high >= (2 << (53 - 32)))
      console.warn("Read UInt64LE > 53 bits : high=#{high}, low=#{low}")

    low + (0x100000000 * high)

  readUNumeric64LE: ->
    low = @readUInt32LE()
    high = @readUInt32LE()

    low + (0x100000000 * high)


  readUNumeric96LE: ->
    dword1 = @readUInt32LE()
    dword2 = @readUInt32LE()
    dword3 = @readUInt32LE()

    dword1 + (0x100000000 * dword2) + (0x100000000 * 0x100000000 * dword3)

  readUNumeric128LE: ->
    dword1 = @readUInt32LE()
    dword2 = @readUInt32LE()
    dword3 = @readUInt32LE()
    dword4 = @readUInt32LE()

    dword1 + (0x100000000 * dword2) + (0x100000000 * 0x100000000 * dword3) + (0x100000000 * 0x100000000 * 0x100000000 * dword4)

  readString: (length, encoding) ->
    encoding ||= @encoding

    @assertEnoughLeftFor(length)
    @position += length
    @buffer.toString(encoding, @position - length, @position)

  readBVarchar: (encoding) ->
    encoding ||= @encoding

    multiplier = if encoding == 'ucs2' then 2 else 1
    length = @readUInt8() * multiplier
    @readString(length, encoding)

  readUsVarchar: (encoding) ->
    encoding ||= @encoding

    multiplier = if encoding == 'ucs2' then 2 else 1
    length = @readUInt16LE() * multiplier
    @readString(length, encoding)

  readBuffer: (length) ->
    @assertEnoughLeftFor(length)
    @position += length
    @buffer.slice(@position - length, @position)

  readArray: (length) ->
    Array.prototype.slice.call(@readBuffer(length), 0, length)

  readAsStringBigIntLE: (length) ->
    @assertEnoughLeftFor(length)
    @position += length
    convertLEBytesToString(@buffer.slice(@position - length, @position))

  readAsStringInt64LE: (length) ->
    @readAsStringBigIntLE(8)

module.exports = ReadableTrackingBuffer
