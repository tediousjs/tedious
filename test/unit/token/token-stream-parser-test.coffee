Debug = require('../../../src/debug')
Parser = require('../../../src/token/token-stream-parser').Parser
TYPE = require('../../../src/token/token').TYPE
ReadableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').ReadableTrackingBuffer
WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer

debug = new Debug({token: true})

module.exports.oneToken = (test) ->
  buffer = new ReadableTrackingBuffer()

  parser = new Parser(debug, buffer, ->
    test.done()
  )

  buffer.add(createDoneTokenBuffer())

module.exports.twoTokens = (test) ->
  test.expect(1)

  buffer = new ReadableTrackingBuffer()

  parser = new Parser(debug, buffer, ->
    test.done()
  )

  parser.on('databaseChange', (event) ->
    test.ok(event)
  )

  buffer.add(createDbChangeTokenBuffer())
  buffer.add(createDoneTokenBuffer())

module.exports.doneWithMore = (test) ->
  buffer = new ReadableTrackingBuffer()

  parser = new Parser(debug, buffer, ->
    test.done()
  )

  buffer.add(createDoneWithMoreTokenBuffer())
  buffer.add(createDoneTokenBuffer())

createDoneTokenBuffer = (more) ->
  more ||= false
  buffer = new WritableTrackingBuffer(50, 'ucs2')

  if more
    status = 0x0001
  else
    status = 0

  buffer.writeUInt8(TYPE.DONE)
  buffer.writeUInt16LE(status)            # status
  buffer.writeUInt16LE(0)                 # rowCount
  buffer.writeUInt64LE(0)                 # curCmd

  buffer.data

createDoneWithMoreTokenBuffer = ->
  createDoneTokenBuffer(true)

createDbChangeTokenBuffer = ->
  oldDb = 'old'
  newDb = 'new'
  buffer = new WritableTrackingBuffer(50, 'ucs2')

  buffer.writeUInt8(TYPE.ENVCHANGE)
  buffer.writeUInt16LE(0)                 # Length written later
  buffer.writeUInt8(0x01)                 # Database
  buffer.writeUInt8(newDb.length)
  buffer.writeString(newDb)
  buffer.writeUInt8(oldDb.length)
  buffer.writeString(oldDb)

  buffer.data.writeUInt16LE(buffer.data.length - (1 + 2), 1);
  #console.log(buffer)

  buffer.data
