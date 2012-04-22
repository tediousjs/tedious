Connection = require('../../src/connection')
Request = require('../../src/request')
fs = require('fs')
TYPES = require('../../src/data-type').typeByName

getConfig = ->
  config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config

  config.options.debug =
    packet: true
    data: true
    payload: true
    token: false
    log: true

  config

exports.prepareExecute = (test) ->
  test.expect(4)
  value = 8

  config = getConfig()

  request = new Request('select @param', (err) ->
    test.ok(!err)
    connection.close()
  )
  request.addParameter('param', TYPES.Int)

  connection = new Connection(config)

  request.on('prepared', () ->
    test.ok(request.handle)
    connection.execute(request, {param: value})
  )

  request.on('row', (columns) ->
    test.strictEqual(columns.length, 1)
    test.strictEqual(columns[0].value, value)
  )

  connection.on('connect', (err) ->
    connection.prepare(request)
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )

exports.unprepare = (test) ->
  test.expect(2)

  config = getConfig()
  prepared = false

  request = new Request('select 3', (err) ->
    test.ok(!err)
    connection.close()
  )

  connection = new Connection(config)

  request.on('prepared', () ->
    test.ok(request.handle)
    connection.unprepare(request)
  )

  connection.on('connect', (err) ->
    connection.prepare(request)
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )
