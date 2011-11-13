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

  connection.on('databaseChange', (database) ->
    test.strictEqual(database, config.options.database)
  )

  connection.on('debug', (message) ->
    #console.log(message)
  )

exports.execSql = (test) ->
  test.expect(8)

  connection = new Connection(config.server, config.userName, config.password, config.options, (err, loggedIn) ->
    test.ok(!err)
    test.ok(loggedIn)
    
    connection.execSql("select 8 as C1, 'abc' as C2, N'def' as C3", (err) ->
      test.ok(!err)
      test.done()
    )
  )
  
  connection.on('columnMetadata', (columnsMetadata) ->
    test.strictEqual(columnsMetadata.length, 3)
  )
  
  connection.on('row', (columns) ->
    test.strictEqual(columns.length, 3)
    test.strictEqual(columns[0].value, 8)
    test.strictEqual(columns[1].value, 'abc')
    test.strictEqual(columns[2].value, 'def')
  )

  connection.on('debug', (message) ->
    #console.log(message)
  )

exports.badCredentials = (test) ->
  test.expect(4)

  connection = new Connection(config.server, config.userName, 'bad-password', config.options, (err, loggedIn) ->
    test.ok(!err)
    test.ok(!loggedIn)

    test.done()
  )

  connection.on('errorMessage', (error) ->
    test.ok(error.message.indexOf('failed'))
    test.strictEqual(error.number, 18456)
  )

  connection.on('debug', (message) ->
    #console.log(message)
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
