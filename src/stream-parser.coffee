stream = require('readable-stream')
BufferList = require('bl')

class Job
  constructor: (@length, @execute) ->

# These jobs are non-dynamic, so we can reuse the job objects.
# This should reduce GC pressure a bit (as less objects will be
# created and garbage collected during stream parsing).
JOBS =
  'readInt8': new Job 1, (buffer, offset) ->
    buffer.readInt8 offset

  'readUInt8': new Job 1, (buffer, offset) ->
    buffer.readUInt8 offset

  'readInt16LE': new Job 2, (buffer, offset) ->
    buffer.readInt16LE offset

  'readInt16BE': new Job 2, (buffer, offset) ->
    buffer.readInt16BE offset

  'readUInt16LE': new Job 2, (buffer, offset) ->
    buffer.readUInt16LE offset

  'readUInt16BE': new Job 2, (buffer, offset) ->
    buffer.readUInt16BE offset

  'readInt32LE': new Job 4, (buffer, offset) ->
    buffer.readInt32LE offset

  'readInt32BE': new Job 4, (buffer, offset) ->
    buffer.readInt32BE offset

  'readUInt32LE': new Job 4, (buffer, offset) ->
    buffer.readUInt32LE offset

  'readUInt32BE': new Job 4, (buffer, offset) ->
    buffer.readUInt32BE offset

  'readInt64LE': new Job 8, (buffer, offset) ->
    2 ** 32 * buffer.readInt32LE(offset + 4) + (if buffer[offset + 4] & 0x80 == 0x80 then 1 else -1) * buffer.readUInt32LE(offset)

  'readInt64BE': new Job 8, (buffer, offset) ->
    2 ** 32 * buffer.readInt32BE(offset) + (if buffer[offset] & 0x80 == 0x80 then 1 else -1) * buffer.readUInt32BE(offset + 4)

  'readUInt64LE': new Job 8, (buffer, offset) ->
    2 ** 32 * buffer.readUInt32LE(offset + 4) + buffer.readUInt32LE(offset)

  'readUInt64BE': new Job 8, (buffer, offset) ->
    2 ** 32 * buffer.readUInt32BE(offset) + buffer.readUInt32BE(offset + 4)

  'readFloatLE': new Job 4, (buffer, offset) ->
    buffer.readFloatLE offset

  'readFloatBE': new Job 4, (buffer, offset) ->
    buffer.readFloatBE offset

  'readDoubleLE': new Job 8, (buffer, offset) ->
    buffer.readDoubleLE offset

  'readDoubleBE': new Job 8, (buffer, offset) ->
    buffer.readDoubleBE offset

class StreamParser extends stream.Transform
  constructor: (options) ->
    options = options or {}
    options.objectMode = true if !options.objectMode?

    super(options)

    @buffer = new BufferList
    @generator = undefined
    @currentStep = undefined

  parser: ->
    throw new Error('Not implemented')

  _transform: (input, encoding, done) ->
    offset = 0
    @buffer.append input

    if !@generator
      @generator = @parser()
      @currentStep = @generator.next()

    job = undefined
    result = undefined
    length = undefined

    while !@currentStep.done
      job = @currentStep.value

      if !(job instanceof Job)
        return done(new Error('invalid job type'))

      length = job.length
      if @buffer.length - offset < length
        break

      result = job.execute(@buffer, offset)
      offset += length
      @currentStep = @generator.next(result)

    @buffer.consume offset

    if @currentStep.done
      @push null

    done()

  Object.keys(JOBS).forEach (jobName) =>
    @::[jobName] = -> JOBS[jobName]

  readBuffer: (length) ->
    new Job length, (buffer, offset) ->
      buffer.slice offset, offset + length

  readString: (length) ->
    new Job length, (buffer, offset) ->
      buffer.toString 'utf8', offset, offset + length

  skip: (length) ->
    new Job length, (buffer, offset) ->
      # Noop

module.exports = StreamParser
