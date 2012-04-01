Connection = require('../../lib/connection')
Request = require('../../lib/request')
fs = require('fs')
TYPES = require('../../lib/data-type').typeByName

getConfig = ->
  config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config

  config.options.debug =
    packet: true
    data: true
    payload: true
    token: false
    log: true

  config

exports.int = (test) ->
  test.expect(5)

  config = getConfig()

  request = new Request('select @param', (err) ->
      test.ok(!err)

      connection.close()
  )

  request.addParameter(TYPES.Int, 'param', 8)

  request.on('doneInProc', (rowCount, more) ->
      test.ok(more)
      test.strictEqual(rowCount, 1)
  )

  request.on('row', (columns) ->
      test.strictEqual(columns.length, 1)
      test.strictEqual(columns[0].value, 8)
  )

  connection = new Connection(config)

  connection.on('connect', (err) ->
      connection.execSql(request)
  )

  connection.on('end', (info) ->
      test.done()
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )

exports.varchar = (test) ->
  test.expect(5)

  config = getConfig()

  request = new Request('select @param', (err) ->
      test.ok(!err)

      connection.close()
  )

  request.addParameter(TYPES.VarChar, 'param', 'qaz')

  request.on('doneInProc', (rowCount, more) ->
      test.ok(more)
      test.strictEqual(rowCount, 1)
  )

  request.on('row', (columns) ->
      test.strictEqual(columns.length, 1)
      test.strictEqual(columns[0].value, 'qaz')
  )

  connection = new Connection(config)

  connection.on('connect', (err) ->
      connection.execSql(request)
  )

  connection.on('end', (info) ->
      test.done()
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )
