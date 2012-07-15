PreloginPayload = require('../../src/prelogin-payload')

exports.noEncrypt = (test) ->
  payload = new PreloginPayload()

  assertPayload(test, payload, 'NOT_SUP')

  test.done()

exports.encrypt = (test) ->
  payload = new PreloginPayload({encrypt: true})

  assertPayload(test, payload, 'ON')

  test.done()

exports.createFromBuffer = (test) ->
  payload = new PreloginPayload()
  new PreloginPayload(payload.data)

  assertPayload(test, payload, 'NOT_SUP')

  test.done()

assertPayload = (test, payload, encryptionString) ->
  test.strictEqual(payload.version.major, 0)
  test.strictEqual(payload.version.minor, 0)
  test.strictEqual(payload.version.patch, 0)
  test.strictEqual(payload.version.trivial, 1)
  test.strictEqual(payload.version.subbuild, 1)

  test.strictEqual(payload.encryptionString, encryptionString)
  test.strictEqual(payload.instance, 0)
  test.strictEqual(payload.threadId, 0)
  test.strictEqual(payload.marsString, 'OFF')
