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

    @position = 0
    @available = @buffer.length
    @buffers = []

  ###
    Add a Buffer to the buffer.
    This may trigger a deferred read to be satisfied.
  ###
  add: (buffer) ->
    @buffers.push(buffer)
    @available += buffer.length

    # If sufficient data is now available to satisify a deferred read, perform the read.
    if @deferred && @available >= @deferred.length
      @useBuffers()

      @read.apply(@, @deferred.readArguments)

  useBuffers: ->
      @buffer = @buffer.slice(@position)
      @buffer = @buffer.concat(@buffers)
      @position = 0
      @buffers = []

  ###
    If there is sufficent data, read the value, and call the callback with the value.
    If there is not enough data, defere the reading of the value until there is
    sufficient data.
  ###
  read: (length, readValueFunction, callback) ->
    if @available >= length
      if @buffer.length - @position < length
        @useBuffers()

      value = readValueFunction.call(@)
      @position += length
      @available -= length
      @deferred = undefined
      callback(value)
    else
      if @deferred
        throw new Error('Already a deferred read pending from buffer')
      @deferred =
        length: length
        readArguments: arguments

  ###
    Read multiple values, then pass them all in an object as an argument
    to a callback.

    reads     : An object.
                The keys are used as keys in the object passed to the callback.
                The values are either functions or arrays.
                  Function values : The functions are read... functions of this class.
                  Array values :    The first array element is a function as above.
                                    The remaining elements are arguments that are passed to
                                    the function.
    callback :  A function that is called when all of the values have been read.
                A single argument, an object, is passed. The keys are the keys from the
                'reads' argument, and the values are the values read from the read... functions.
  ###
  readMultiple: (reads, callback) ->
    values = {}
    names = Object.keys(reads)
    name = undefined
    nameNumber = 0

    valueCallback = (value) ->
      values[name] = value

      if (nameNumber == names.length)
        callback(values)
      else
        readOne()

    # Read a value, then read another, until there are no more to read.
    readOne = =>
      name = names[nameNumber]
      nameNumber++

      if Array.isArray(reads[name])
        readFunction = reads[name][0]
        args = reads[name][1]
      else
        readFunction = reads[name]
        args = []

      args.push(valueCallback)
      readFunction.apply(@, args)

    readOne()

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
