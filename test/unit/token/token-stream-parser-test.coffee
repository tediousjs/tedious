Debug = require('../../../src/debug')
Parser = require('../../../src/token/token-stream-parser').Parser
TYPE = require('../../../src/token/token').TYPE
ReadableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').ReadableTrackingBuffer
WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer

debug = new Debug({token: true})

module.exports.oneToken = (test) ->
  test.expect(1)

  dbChangeTokenBuffer = createDbChangeTokenBuffer()

  buffer = new ReadableTrackingBuffer()

  parser = new Parser(debug, buffer, dbChangeTokenBuffer.length, ->
    test.done()
  )

  parser.on('databaseChange', (event) ->
    test.ok(event)
  )

  buffer.add(dbChangeTokenBuffer)

module.exports.twoTokens = (test) ->
  test.expect(2)

  dbChangeTokenBuffer = createDbChangeTokenBuffer()

  buffer = new ReadableTrackingBuffer()

  parser = new Parser(debug, buffer, 2 * dbChangeTokenBuffer.length, ->
    test.done()
  )

  parser.on('databaseChange', (event) ->
    test.ok(event)
  )

  buffer.add(dbChangeTokenBuffer)
  buffer.add(dbChangeTokenBuffer)

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
