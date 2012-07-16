Connection = require('../../src/connection')
Request = require('../../src/request')
fs = require('fs')

getConfig = ->
  config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config
  instanceName = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).instanceName

  config.options.debug =
    packet: true
    data: true
    payload: true
    token: false
    log: true

  config

getInstanceName = ->
  JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).instanceName

exports.badServer = (test) ->
  config = getConfig()
  config.server = 'bad-server'

  connection = new Connection(config)

  connection.on('connect', (err) ->
    test.ok(err)
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )

exports.badPort = (test) ->
  config = getConfig()
  config.options.port = -1
  config.options.connectTimeout = 200

  connection = new Connection(config)

  connection.on('connect', (err) ->
    test.ok(err)
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )

exports.badCredentials = (test) ->
  test.expect(2)

  config = getConfig()
  config.password = 'bad-password'

  connection = new Connection(config)

  connection.on('connect', (err) ->
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

exports.connectByPort = (test) ->
  test.expect(2)

  config = getConfig()

  connection = new Connection(config)

  connection.on('connect', (err) ->
    test.ok(!err)

    connection.close()
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('databaseChange', (database) ->
    test.strictEqual(database, config.options.database)
  )

  connection.on('infoMessage', (info) ->
    #console.log("#{info.number} : #{info.message}")
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )

exports.connectByInstanceName = (test) ->
  if !getInstanceName()
    # Config says don't do this test (probably because SQL Server Browser is not available).
    console.log('Skipping connectByInstanceName test')
    test.done()
    return

  test.expect(2)

  config = getConfig()
  delete config.options.port
  config.options.instanceName = getInstanceName()

  connection = new Connection(config)

  connection.on('connect', (err) ->
    test.ok(!err)

    connection.close()
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('databaseChange', (database) ->
    test.strictEqual(database, config.options.database)
  )

  connection.on('infoMessage', (info) ->
    #console.log("#{info.number} : #{info.message}")
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )


exports.encrypt = (test) ->
  test.expect(5)

  config = getConfig()
  config.options.encrypt = true

  connection = new Connection(config)

  connection.on('connect', (err) ->
    test.ok(!err)

    connection.close()
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('databaseChange', (database) ->
    test.strictEqual(database, config.options.database)
  )

  connection.on('secure', (cleartext) ->
    test.ok(cleartext)
    test.ok(cleartext.getCipher())
    test.ok(cleartext.getPeerCertificate())
  )

  connection.on('infoMessage', (info) ->
    #console.log("#{info.number} : #{info.message}")
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )

exports.execSql = (test) ->
  test.expect(8)

  config = getConfig()

  request = new Request('select 8 as C1', (err, rowCount) ->
      test.ok(!err)
      test.strictEqual(rowCount, 1)

      connection.close()
  )

  request.on('doneInProc', (rowCount, more) ->
      test.ok(more)
      test.strictEqual(rowCount, 1)
  )

  request.on('columnMetadata', (columnsMetadata) ->
      test.strictEqual(columnsMetadata.length, 1)
  )

  request.on('row', (columns) ->
      test.strictEqual(columns.length, 1)
      test.strictEqual(columns[0].value, 8)
      test.strictEqual(columns.C1.value, 8)
  )

  connection = new Connection(config)

  connection.on('connect', (err) ->
      connection.execSql(request)
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

exports.execSqlWithOrder = (test) ->
  test.expect(10)

  config = getConfig()

  sql = "select top 2 object_id, name, column_id, system_type_id from sys.columns order by name, system_type_id"
  request = new Request(sql, (err, rowCount) ->
      test.ok(!err)
      test.strictEqual(rowCount, 2)

      connection.close()
  )

  request.on('doneInProc', (rowCount, more) ->
      test.ok(more)
      test.strictEqual(rowCount, 2)
  )

  request.on('columnMetadata', (columnsMetadata) ->
      test.strictEqual(columnsMetadata.length, 4)
  )

  request.on('order', (orderColumns) ->
      test.strictEqual(orderColumns.length, 2)
      test.strictEqual(orderColumns[0], 2)
      test.strictEqual(orderColumns[1], 4)
  )

  request.on('row', (columns) ->
    test.strictEqual(columns.length, 4)
  )

  connection = new Connection(config)

  connection.on('connect', (err) ->
      connection.execSql(request)
  )

  connection.on('end', (info) ->
      test.done()
  )

  connection.on('infoMessage', (info) ->
    #console.log("#{info.number} : #{info.message}")
  )

  connection.on('errorMessage', (error) ->
    #console.log("#{error.number} : #{error.message}")
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )

exports.execSqlMultipleTimes = (test) ->
  test.expect(20)

  requestsToMake = 5;
  config = getConfig()

  makeRequest = ->
    if requestsToMake == 0
      connection.close()
      return

    request = new Request('select 8 as C1', (err, rowCount) ->
        test.ok(!err)
        test.strictEqual(rowCount, 1)

        requestsToMake--
        makeRequest()
    )

    request.on('doneInProc', (rowCount, more) ->
        test.strictEqual(rowCount, 1)
        #makeRequest()
    )

    request.on('row', (columns) ->
        test.strictEqual(columns.length, 1)
    )

    connection.execSql(request)

  connection = new Connection(config)

  connection.on('connect', (err) ->
    makeRequest()
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

exports.execBadSql = (test) ->
  test.expect(2)

  config = getConfig()

  request = new Request('bad syntax here', (err) ->
      test.ok(err)

      connection.close()
  )

  connection = new Connection(config)

  connection.on('connect', (err) ->
      connection.execSql(request)
  )

  connection.on('end', (info) ->
      test.done()
  )

  connection.on('errorMessage', (error) ->
    #console.log("#{error.number} : #{error.message}")
    test.ok(error)
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )

exports.sqlWithMultipleResultSets = (test) ->
  test.expect(8)

  config = getConfig()
  row = 0

  request = new Request('select 1; select 2;', (err, rowCount) ->
      test.ok(!err)
      test.strictEqual(rowCount, 2)

      connection.close()
  )

  request.on('doneInProc', (rowCount, more) ->
      test.strictEqual(rowCount, 1)
  )

  request.on('columnMetadata', (columnsMetadata) ->
      test.strictEqual(columnsMetadata.length, 1)
  )

  request.on('row', (columns) ->
      test.strictEqual(columns[0].value, ++row)
  )

  connection = new Connection(config)

  connection.on('connect', (err) ->
      connection.execSql(request)
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

exports.execProcAsSql = (test) ->
  test.expect(7)

  config = getConfig()

  request = new Request('exec sp_help int', (err, rowCount) ->
      test.ok(!err)
      test.strictEqual(rowCount, 1)

      connection.close()
  )

  request.on('doneProc', (rowCount, more, returnStatus) ->
      test.ok(!more)
      test.strictEqual(returnStatus, 0)
  )

  request.on('doneInProc', (rowCount, more) ->
      test.ok(more)
  )

  request.on('row', (columns) ->
      test.ok(true)
  )

  connection = new Connection(config)

  connection.on('connect', (err) ->
      connection.execSql(request)
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
