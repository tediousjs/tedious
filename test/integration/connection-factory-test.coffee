ConnectionFactory = require('../../lib/connection/connection-factory')
fs = require('fs')

#require('../../lib/tedious').statemachineLogLevel = 8

connectionFactory = new ConnectionFactory()

getConfig = ->
  config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8'))

  config.options.debug =
    packet: true
    data: true
    payload: true
    token: false

  config

exports.badServer = (test) ->
  config = getConfig()
  config.server = 'bad-server'

  connection = connectionFactory.createConnection(config)

  connection.on('connection', (err) ->
    test.ok(err)
  )

  connection.on('end', (info) ->
    test.done()
  )

exports.badPort = (test) ->
  config = getConfig()
  config.options.port = -1
  config.options.connectTimeout = 200

  connection = connectionFactory.createConnection(config)

  connection.on('connection', (err) ->
    test.ok(err)
  )

  connection.on('end', (info) ->
    test.done()
  )

exports.badCredentials = (test) ->
  config = getConfig()
  config.password = 'bad-password'

  test.expect(2)

  connection = connectionFactory.createConnection(config)

  connection.on('connection', (err) ->
    test.ok(err)

    connection.close()
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('infoMessage', (info) ->
    #console.log("#{info.number} : #{info.message}")
  )

  connection.on('errorMessage', (error) ->
    #console.log("#{error.number} : #{error.message}")
    test.ok(~error.message.indexOf('failed'))
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )

exports.connect = (test) ->
  config = getConfig()

  connection = connectionFactory.createConnection(config)

  connection.on('connection', (err) ->
    test.ok(!err)

    connection.close()
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('infoMessage', (info) ->
    #console.log("#{info.number} : #{info.message}")
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )
