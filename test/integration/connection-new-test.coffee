Connection = require('../../lib/connection/connection')
fs = require('fs')

getConfig = ->
  config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8'))

  config.options.debug =
    data: true
    payload: true
    token: true

  config.statemachine =
    logLevel: 5

  config

exports.badPort = (test) ->
  config = getConfig()

  config.options.port = -1
  config.options.connectTimeout = 200

  connection = new Connection(config)

  connection.on('connection', (err) ->
    test.ok(err)
    test.done()
  )

exports.connect = (test) ->
  config = getConfig()

  connection = new Connection(config)

  connection.on('connection', (err) ->
      test.ok(!err)
      test.done()
  )
