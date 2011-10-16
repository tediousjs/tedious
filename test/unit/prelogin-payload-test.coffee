PreloginPayload = require('../../lib/prelogin-payload')

exports.createFromScratch = (test) ->
  payload = new PreloginPayload()

  assertPayload(test, payload)

  test.done()

exports.createFromBuffer = (test) ->
  payload = new PreloginPayload()
  new PreloginPayload(payload.data)

  assertPayload(test, payload)

  test.done()

assertPayload = (test, payload) ->
  test.strictEqual(payload.version.major, 0)
  test.strictEqual(payload.version.minor, 0)
  test.strictEqual(payload.version.patch, 0)
  test.strictEqual(payload.version.trivial, 1)
  test.strictEqual(payload.version.subbuild, 1)

  test.strictEqual(payload.encryptionString, 'NOT_SUP')
  test.strictEqual(payload.instance, 0)
  test.strictEqual(payload.threadId, 0)
  test.strictEqual(payload.marsString, 'OFF')
