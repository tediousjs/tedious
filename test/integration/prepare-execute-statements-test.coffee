Connection = require('../../src/connection')
Request = require('../../src/request')
fs = require('fs')
TYPES = require('../../src/data-type').typeByName
assert = require('chai').assert

getConfig = ->

describe "Prepared Statement", ->
  beforeEach (done) ->
    @config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config

    @config.options.debug =
      packet: true
      data: true
      payload: true
      token: false
      log: true

    @connection = new Connection(@config)
    @connection.on('connect', done)

  afterEach ->
    @connection.close if @connection

  it "fires a 'prepared' event once it was prepared", (done) ->
    request = new Request('select @param', done)
    request.addParameter('param', TYPES.Int)

    @connection.prepare(request)

    request.on 'prepared', ->
      assert.ok(request.handle)
      done()

  it "can be executed", (done) ->
    request = new Request('select @param', done)
    request.addParameter('param', TYPES.Int)

    value = 8

    request.on 'prepared', =>
      @connection.execute(request, { param: value })

    request.on 'row', (columns) ->
      assert.strictEqual(columns.length, 1)
      assert.strictEqual(columns[0].value, value)

    @connection.prepare(request)

  it "can be unprepared", (done) ->
    request = new Request('select @param', done)
    request.addParameter('param', TYPES.Int)

    request.on 'prepared', =>
      @connection.unprepare(request)

    @connection.prepare(request)
