Connection = require('../../src/connection')
Request = require('../../src/request')
fs = require('fs')

debug = true

config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config

if (debug)
  config.options.debug =
    packet: true
    data: true
    payload: true
    token: true
    log: true
else
  config.options.debug = {}

exports.beginTransaction = (test) ->
  test.expect(2)

  request = new Request('select 3', (err) ->
    test.ok(!err)
    console.log('request complete')
  )

  connection = new Connection(config)

  connection.on('connect', (err) ->
    connection.beginTransaction((err) ->
      test.ok(!err)

      connection.execSql(request)
    , 'abc')
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('errorMessage', (error) ->
    console.log("#{error.number} : #{error.message}")
  )

  connection.on('debug', (message) ->
    if (debug)
      console.log(message)
  )
