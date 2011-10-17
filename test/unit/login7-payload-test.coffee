Login7Payload = require('../../lib/login7-payload')

exports.create = (test) ->
  payload = new Login7Payload({
    userName: 'user',
    password: 'pw',
    appName: 'app',
    serverName: 'server',
    language: 'lang',
    database: 'db'
  })

  test.ok(payload.data)
  #assertPayload(test, payload)
  console.log(payload.toString(''))

  test.done()

###
exports.createFromBuffer = (test) ->
  payload = new Login7Payload()
  new Login7Payload(payload.data)

  assertPayload(test, payload)

  test.done()
###

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
