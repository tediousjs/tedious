Debug = require('../../lib/debug')
EventEmitter = require('events').EventEmitter

active = ->
  true

inactive = ->
  false

payload = 'payload'

class Packet
  headerToString: ->
    'header'

  dataToString: ->
    'data'

exports.inactive = (test) ->
  emitter = new EventEmitter()
  emitter.on('debug', (text) ->
    test.ok(false)
  )

  debug = new Debug(emitter, inactive)
  debug.payload(payload)

  test.done()

exports.packet = (test) ->
  emitCount = 0;

  emitter = new EventEmitter()
  emitter.on('debug', (text) ->
    emitCount++

    switch emitCount
      when 2
        test.ok(/dir/.test(text))
      when 3
        test.ok(/header/.test(text))
        test.done()
  )

  debug = new Debug(emitter, active)
  debug.packet('dir', new Packet())

exports.payloadEnabled = (test) ->
  emitter = new EventEmitter()
  emitter.on('debug', (text) ->
    test.strictEqual(text, payload)

    test.done()
  )

  debug = new Debug(emitter, active, {payload: true})
  debug.payload(payload)

exports.payloadNotEnabled = (test) ->
  emitter = new EventEmitter()
  emitter.on('debug', (text) ->
    test.ok(false)
  )

  debug = new Debug(emitter, active)
  debug.payload(payload)

  test.done()

exports.dataEnable = (test) ->
  emitCount = 0;

  emitter = new EventEmitter()
  emitter.on('debug', (text) ->
    test.strictEqual(text, 'data')

    test.done()
  )

  debug = new Debug(emitter, active, {data: true})
  debug.data(new Packet())

exports.dataNotEnabled = (test) ->
  emitter = new EventEmitter()
  emitter.on('debug', (text) ->
    test.ok(false)
  )

  debug = new Debug(emitter, active)
  debug.data(new Packet())

  test.done()
