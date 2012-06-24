PreloginPayload = require('../../src/prelogin-payload').PreloginPayload
parsePrelogin = require('../../src/prelogin-payload').parsePrelogin
ReadableTrackingBuffer = require('../../src/tracking-buffer/tracking-buffer').ReadableTrackingBuffer
tediousVersion = require('../../src/tedious').version

exports.createFromScratch = (test) ->
  payload = new PreloginPayload()

  assertPayload(test, payload)

  test.done()

exports.createFromBuffer = (test) ->
  buffer = new ReadableTrackingBuffer()
  parsePrelogin(buffer, (prelogin) ->
    assertPayload(test, payload)
    test.done()
  )

  payload = new PreloginPayload()

  #new PreloginPayload(buffer, (payload) ->
  #  assertPayload(test, payload)
  #  test.done()
  #)

  buffer.add(payload.toBuffer())

assertPayload = (test, payload) ->
  test.strictEqual(payload.version.major, tediousVersion.major)
  test.strictEqual(payload.version.minor, tediousVersion.minor)
  test.strictEqual(payload.version.patch, tediousVersion.patch)
  test.strictEqual(payload.version.trivial, 0)
  test.strictEqual(payload.version.subbuild, 0)

  test.strictEqual(payload.encryptionString, 'NOT_SUP')
  test.strictEqual(payload.instance, 0)
  test.strictEqual(payload.threadId, 0)
  test.strictEqual(payload.marsString, 'OFF')
