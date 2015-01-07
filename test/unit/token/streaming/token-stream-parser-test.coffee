Debug = require('../../../src/debug')
Parser = require('../../../src/token/token-stream-parser').Parser
TYPE = require('../../../src/token/token').TYPE
WritableTrackingBuffer = require('../../../src/tracking-buffer/tracking-buffer').WritableTrackingBuffer

debug = new Debug({token: true})

module.exports.envChange = (test) ->
  test.expect(2)

  buffer = createDbChangeBuffer()

  parser = new Parser(debug)
  parser.on('databaseChange', (event) ->
    test.ok(event)
  )

  parser.addBuffer(buffer)

  test.ok(parser.isEnd())

  test.done()

module.exports.tokenSplitAcrossBuffers = (test) ->
  test.expect(2)

  buffer = createDbChangeBuffer()

  parser = new Parser(debug)
  parser.on('databaseChange', (event) ->
      test.ok(event)
  )

  parser.addBuffer(buffer.slice(0,6))
  parser.addBuffer(buffer.slice(6))

  test.ok(parser.isEnd())

  test.done()

createDbChangeBuffer = ->
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
