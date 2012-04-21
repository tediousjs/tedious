Debug = require('../../src/debug')

payload = 'payload'

class Packet
  headerToString: ->
    'header'

  dataToString: ->
    'data'

exports.packet = (test) ->
  emitCount = 0;

  debug = new Debug({packet: true})

  debug.on('debug', (text) ->
    emitCount++

    switch emitCount
      when 2
        test.ok(/dir/.test(text))
      when 3
        test.ok(/header/.test(text))
        test.done()
  )

  debug.packet('dir', new Packet())

exports.payloadEnabled = (test) ->
  debug = new Debug({payload: true})
  debug.on('debug', (text) ->
    test.strictEqual(text, payload)

    test.done()
  )

  debug.payload(->
    payload
  )

exports.payloadNotEnabled = (test) ->
  debug = new Debug()
  debug.on('debug', (text) ->
    test.ok(false)
  )

  debug.payload(payload)

  test.done()

exports.dataEnable = (test) ->
  debug = new Debug({data: true})
  debug.on('debug', (text) ->
    test.strictEqual(text, 'data')

    test.done()
  )

  debug.data(new Packet())

exports.dataNotEnabled = (test) ->
  debug = new Debug()
  debug.on('debug', (text) ->
    test.ok(false)
  )

  debug.data(new Packet())

  test.done()

exports.tokenEnabled = (test) ->
  debug = new Debug({token: true})
  debug.on('debug', (token) ->
    test.ok(token.indexOf('test') != 0)

    test.done()
  )

  debug.token({name: 'test'})

exports.payloadNotEnabled = (test) ->
  debug = new Debug()
  debug.on('debug', (token) ->
    test.ok(false)
  )

  debug.token({name: 'test'})

  test.done()
