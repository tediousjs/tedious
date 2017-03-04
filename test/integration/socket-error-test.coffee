Connection = require('../../src/connection')
Request = require('../../src/request')
fs = require('fs')

getConfig = ->
  config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config

  config.options.debug =
    packet: true
    data: true
    payload: true
    token: false
    log: true

  config

exports.socketError = (test) ->
  config = getConfig()

  connection = new Connection(config)

  test.expect(3);

  connection.on('connect', (err) ->
    test.ifError(err)
    
    # create temporary table
    request = new Request("WAITFOR 00:00:30", (err) ->
      test.ok(~err.message.indexOf('socket error'))
    )
    connection.execSql(request)
    connection.socket.emit('error', new Error('socket error'))
  )

  connection.on('end', (info) ->
    test.done();
  )

  connection.on('error', (err) ->
    test.ok(~err.message.indexOf('socket error'))
  )
 