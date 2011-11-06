Connection = require('../../lib/connection')
fs = require('fs')

config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8'))
config.options.debug =
  data: true
  payload: true
  token: true

exports.connect = (test) ->
  connection = new Connection(config.server, config.userName, config.password, config.options, (err, loggedIn) ->
    test.ok(!err)
    test.ok(loggedIn)
    test.strictEqual(connection.database(), config.options.database)

    test.done()
  )

  connection.on('debug', (message) ->
    console.log(message)
  )

exports.badCredentials = (test) ->
  test.expect(4)

  connection = new Connection(config.server, config.userName, 'bad-password', config.options, (err, loggedIn) ->
    console.log(err, loggedIn)
    test.ok(!err)
    test.ok(!loggedIn)

    test.done()
  )

  connection.on('errorMessage', (error) ->
    test.ok(error.message.indexOf('failed'))
    test.strictEqual(error.number, 18456)
  )

  connection.on('debug', (message) ->
    console.log(message)
  )

exports.badServer = (test) ->
  connection = new Connection('bad-server', config.userName, config.password, config.options, (err, loggedIn) ->
    test.ok(false)
  )

  connection.on('fatal', (error) ->
    test.done()
  )

  connection.on('debug', (message) ->
    #console.log(message)
  )

exports.badPort = (test) ->
  config.options.port = -1
  connection = new Connection(config.server, config.userName, config.password, config.options, (err, loggedIn) ->
    test.ok(false)
  )

  connection.on('fatal', (error) ->
    test.done()
  )

  connection.on('debug', (message) ->
    #console.log(message)
  )

  
    #test.ok(info.infos.length > 0);
    #test.strictEqual(info.errors.length, 0);
  
    #test.ok(info.envChanges.length > 0);
    #info.envChanges.forEach(function(envChange) {
    #  if (envChange.type === 'database') {
    #    test.strictEqual(envChange.newValue, config.options.database);
    #  }
