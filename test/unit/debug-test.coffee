Debug = require('../../src/debug')

assert = require("chai").assert

class Packet
  headerToString: ->
    'header'

  dataToString: ->
    'data'

describe "Debug", ->
  describe "#packet", ->
    it "emits debug information for the given packet if packet debugging is enabled", () ->
      data = []

      debug = new Debug({ packet: true })
      debug.on('debug', (text) ->
        data.push(text)
      )

      debug.packet('Sent', new Packet())
      assert.deepEqual(data, ["", "Sent", "header"])

    it "does not emit debug information for the given packet if packet debugging is not enabled", () ->
      data = []

      debug = new Debug()
      debug.on('debug', (text) ->
        data.push(text)
      )

      debug.packet('Sent', new Packet())
      assert.deepEqual(data, [])

  describe "#payload", ->
    it "emits debug information for the given payload if payload debugging is enabled", () ->
      data = []

      debug = new Debug({ payload: true })
      debug.on('debug', (text) ->
        data.push(text)
      )

      debug.payload(-> 'Some Payload')
      assert.deepEqual(data, ['Some Payload'])

    it "does not emit debug information for the given payload if payload debugging is not enabled", () ->
      data = []

      debug = new Debug()
      debug.on('debug', (text) ->
        data.push(text)
      )

      debug.payload(-> 'Some Payload')
      assert.deepEqual(data, [])

  describe "#data", ->
    it "emits debug information for the given data if data debugging is enabled", () ->
      data = []

      debug = new Debug({ data: true })
      debug.on('debug', (text) ->
        data.push(text)
      )

      debug.data(new Packet())
      assert.deepEqual(data, ["data"])

    it "does not emit debug information for the given data if data debugging is not enabled", () ->
      data = []

      debug = new Debug()
      debug.on('debug', (text) ->
        data.push(text)
      )

      debug.data(new Packet())
      assert.deepEqual(data, [])

  describe "#token", ->
    it "emits debug information for the given token if token debugging is enabled", () ->
      data = []

      debug = new Debug({ token: true })
      debug.on('debug', (text) ->
        data.push(text)
      )

      debug.token({name: 'test'})
      assert.lengthOf(data, 1)
      assert.include(data[0], 'test')

    it "does not emit debug information for the given token if token debugging is not enabled", () ->
      data = []

      debug = new Debug()
      debug.on('debug', (text) ->
        data.push(text)
      )

      debug.token({name: 'test'})
      assert.deepEqual(data, [])