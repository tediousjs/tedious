Connection = require('../../lib/connection')
Request = require('../../lib/request')
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

exports.connect = (test) ->
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

exports.execSql = (test) ->
  test.expect(7)

  config = getConfig()

  request = new Request('select 8 as C1', (err) ->
      test.ok(!err)

      connection.close()
  )

  request.on('done', (rowCount, more) ->
      test.ok(!more)
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
  test.expect(9)

  config = getConfig()

  request = new Request("select top 2 object_id, name, column_id, system_type_id from sys.columns order by name, system_type_id", (err) ->
      test.ok(!err)

      connection.close()
  )

  request.on('done', (rowCount, more) ->
      test.ok(!more)
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

  connection.on('debug', (text) ->
    #console.log(text)
  )

exports.execSqlMultipleTimes = (test) ->
  test.expect(15)

  requestsToMake = 5;
  config = getConfig()

  makeRequest = ->
    if requestsToMake == 0
      connection.close()
      return

    request = new Request('select 8 as C1', (err) ->
        test.ok(!err)

        requestsToMake--
        makeRequest()
    )

    request.on('done', (rowCount, more) ->
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
  test.expect(4)

  config = getConfig()

  request = new Request('bad syntax here', (err) ->
      test.ok(err)

      connection.close()
  )

  request.on('done', (rowCount, more) ->
      test.ok(!more)
      test.ok(!rowCount)
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
  test.expect(9)

  config = getConfig()
  row = 0

  request = new Request('select 1; select 2;', (err) ->
      test.ok(!err)

      connection.close()
  )

  request.on('done', (rowCount, more) ->
      switch row
        when 1
          test.ok(more)
        when 2
          test.ok(!more)
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
  test.expect(5)

  config = getConfig()

  request = new Request('exec sp_help int', (err) ->
      test.ok(!err)

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

exports.execFailedProc = (test) ->
  test.expect(5)

  config = getConfig()

  request = new Request('exec sp_help bad_object_name', (err) ->
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
      test.ok(error)
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )

###
exports.requestInfoErrorMessages = (test) ->
  test.expect(9)

  config = getConfig()
  done = 0

  request = new Request("use #{config.options.database}; select 1; select s;", (err) ->
      test.ok(err)

      connection.close()
  )

  request.on('done', (rowCount, more) ->
      switch ++done
        when 1
          console.log 1
          test.ok(more)
        when 2
          console.log 2
          test.ok(more)
        when 2
          console.log 3
          test.ok(!more)
  )

  connection = new Connection(config)

  connection.on('connect', (err) ->
      connection.execSql(request)
  )

  connection.on('end', (info) ->
      test.done()
  )

  request.on('row', (columns) ->
      console.log columns
  )

  connection.on('infoMessage', (info) ->
    console.log("#{info.number} : #{info.message}")
  )

  connection.on('errorMessage', (error) ->
    console.log("#{error.number} : #{error.message}")
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )

###
