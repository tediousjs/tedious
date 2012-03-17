Connection = require('../../lib/connection')
Request = require('../../lib/request')
TYPES = require('../../lib/data-type').typeByName
fs = require('fs')

getConfig = ->
  config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8'))

  config.options.debug =
    packet: true
    data: true
    payload: true
    token: false
    log: true

  config

exports.execProc = (test) ->
  test.expect(5)

  config = getConfig()

  request = new Request('sp_help', (err) ->
    console.log err
    test.ok(!err)

    connection.close()
  )

  request.addParameter(TYPES.NVarChar, 'objname', 'int')

  request.on('doneProc', (rowCount, more, returnStatus) ->
    test.ok(!more)
    test.strictEqual(returnStatus, 0)
  )

  request.on('doneInProc', (rowCount, more) ->
    test.ok(more)
  )

  request.on('row', (columns) ->
    test.strictEqual(columns.Type_name.value, 'int')
  )

  connection = new Connection(config)

  connection.on('connect', (err) ->
    connection.callProcedure(request)
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('infoMessage', (info) ->
    #console.log("#{info.number} : #{info.message}")
  )

  connection.on('debug', (text) ->
    console.log(text)
  )

exports.execFailedProc = (test) ->
  test.expect(5)

  config = getConfig()

  request = new Request('bad_proc_name', (err) ->
    test.ok(err)

    connection.close()
  )

  request.on('doneProc', (rowCount, more, returnStatus) ->
    test.ok(!more)
    test.strictEqual(returnStatus, 1)   # Non-zero indicates a failure.
  )

  request.on('doneInProc', (rowCount, more) ->
    test.ok(more)
  )

  request.on('row', (columns) ->
    test.ok(false)
  )

  connection = new Connection(config)

  connection.on('connect', (err) ->
    connection.callProcedure(request)
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('infoMessage', (info) ->
    #console.log("#{info.number} : #{info.message}")
  )

  connection.on('errorMessage', (error) ->
    #console.log("#{error.number} : #{error.message}")
    test.ok(error)
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )
