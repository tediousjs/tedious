async = require('async')
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
    token: true
    log: true

  config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION

  config

process.on 'uncaughtException', (err) ->
  console.error err.stack

getInstanceName = ->
  JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).instanceName

getNtlmConfig = ->
  JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).ntlm

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

  connection = null

  test.throws ->
    connection = new Connection(config)

  test.done()

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
  config = getConfig()

  unless config.options?.port?
    # Config says don't do this test (probably because ports are dynamic).
    console.log('Skipping connectByPort test')
    test.done()
    return

  test.expect(2)

  connection = new Connection(config)

  connection.on('connect', (err) ->
    test.ifError(err)

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
    test.ifError(err)

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

exports.connectByInvalidInstanceName = (test) ->
  if !getInstanceName()
    # Config says don't do this test (probably because SQL Server Browser is not available).
    console.log('Skipping connectByInvalidInstanceName test')
    test.done()
    return

  test.expect(1)

  config = getConfig()
  delete config.options.port
  config.options.instanceName = "#{getInstanceName()}X"

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

  connection.on('debug', (text) ->
    #console.log(text)
  )

DomainCaseEnum = {
    AsIs: 0,
    Lower: 1,
    Upper: 2
}

runNtlmTest = (test, domainCase) ->
  if !getNtlmConfig()
    console.log('Skipping ntlm test')
    test.done()
    return

  test.expect(1)

  config = getConfig()
  ntlmConfig = getNtlmConfig()

  config.userName = ntlmConfig.userName
  config.password = ntlmConfig.password

  switch domainCase
    when DomainCaseEnum.AsIs then config.domain = ntlmConfig.domain
    when DomainCaseEnum.Lower then config.domain = ntlmConfig.domain.toLowerCase()
    when DomainCaseEnum.Upper then config.domain = ntlmConfig.domain.toUpperCase()
    else test.ok(false, 'Unexpected value for domainCase: ' + domainCase)

  connection = new Connection(config)

  connection.on('connect', (err) ->
    test.ifError(err)

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

exports.ntlm = (test) ->
  runNtlmTest test, DomainCaseEnum.AsIs 

exports.ntlmLower = (test) ->
  runNtlmTest test, DomainCaseEnum.Lower

exports.ntlmUpper = (test) ->
  runNtlmTest test, DomainCaseEnum.Upper

exports.encrypt = (test) ->
  test.expect(5)

  config = getConfig()
  config.options.encrypt = true

  connection = new Connection(config)

  connection.on('connect', (err) ->
    test.ifError(err)

    connection.close()
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('rerouting', (info) ->
    test.expect(8)
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
  test.expect(7)

  config = getConfig()

  request = new Request('select 8 as C1', (err, rowCount) ->
      test.ifError(err)
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

exports.numericColumnName = (test) ->
  test.expect(5)

  config = getConfig()
  config.options.useColumnNames = true

  request = new Request('select 8 as [123]', (err, rowCount) ->
      test.ifError(err)
      test.strictEqual(rowCount, 1)

      connection.close()
  )

  request.on('columnMetadata', (columnsMetadata) ->
      test.strictEqual(Object.keys(columnsMetadata).length, 1)
  )

  request.on('row', (columns) ->
      test.strictEqual(Object.keys(columns).length, 1)
      test.strictEqual(columns[123].value, 8)
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

exports.duplicateColumnNames = (test) ->
  test.expect(6)

  config = getConfig()
  config.options.useColumnNames = true

  request = new Request('select 1 as abc, 2 as xyz, \'3\' as abc', (err, rowCount) ->
      test.ifError(err)
      test.strictEqual(rowCount, 1)

      connection.close()
  )

  request.on('columnMetadata', (columnsMetadata) ->
      test.strictEqual(Object.keys(columnsMetadata).length, 2)
  )

  request.on('row', (columns) ->
      test.strictEqual(Object.keys(columns).length, 2)

      test.strictEqual(columns.abc.value, 1)
      test.strictEqual(columns.xyz.value, 2)
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
  timesToExec = 5
  sqlExecCount = 0

  test.expect(timesToExec * 7)

  config = getConfig()

  execSql = ->
    if sqlExecCount == timesToExec
      connection.close()
      return

    request = new Request('select 8 as C1', (err, rowCount) ->
        test.ifError(err)
        test.strictEqual(rowCount, 1)

        sqlExecCount++
        execSql()
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
    )

    connection.execSql(request)

  connection = new Connection(config)

  connection.on('connect', (err) ->
    execSql()
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
      test.ifError(err)
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
        test.ifError(err)
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
      test.ifError(err)
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

exports.rowCountForUpdate = (test) ->
  test.expect(2)

  config = getConfig()
  row = 0

  setupSql = """
    create table #tab1 (id int, name nvarchar(10));
    insert into #tab1 values(1, N'a1');
    insert into #tab1 values(2, N'a2');
    insert into #tab1 values(3, N'b1');
    update #tab1 set name = 'a3' where name like 'a%'
  """

  request = new Request(setupSql, (err, rowCount) ->
      test.ifError(err)
      test.strictEqual(rowCount, 5)
      connection.close()
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

exports.rowCollectionOnRequestCompletion = (test) ->
  test.expect(5)

  config = getConfig()
  config.options.rowCollectionOnRequestCompletion = true

  request = new Request('select 1 as a; select 2 as b;', (err, rowCount, rows) ->
    test.strictEqual(rows.length, 2)

    test.strictEqual(rows[0][0].metadata.colName, 'a')
    test.strictEqual(rows[0][0].value, 1)
    test.strictEqual(rows[1][0].metadata.colName, 'b')
    test.strictEqual(rows[1][0].value, 2)

    connection.close()
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

exports.rowCollectionOnDone = (test) ->
  test.expect(6)

  config = getConfig()
  config.options.rowCollectionOnDone = true

  doneCount = 0

  request = new Request('select 1 as a; select 2 as b;', (err, rowCount, rows) ->
    connection.close()
  )

  request.on('doneInProc', (rowCount, more, rows) ->
    test.strictEqual(rows.length, 1)

    switch ++doneCount
      when 1
        test.strictEqual(rows[0][0].metadata.colName, 'a')
        test.strictEqual(rows[0][0].value, 1)
      when 2
        test.strictEqual(rows[0][0].metadata.colName, 'b')
        test.strictEqual(rows[0][0].value, 2)
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
      test.ifError(err)
      test.strictEqual(rowCount, 0)

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

exports.resetConnection = (test) ->
  test.expect(4)

  config = getConfig()

  testAnsiNullsOptionOn = (callback) ->
    testAnsiNullsOption(true, callback)

  testAnsiNullsOptionOff = (callback) ->
    testAnsiNullsOption(false, callback)

  testAnsiNullsOption = (expectedOptionOn, callback) ->
    request = new Request('select @@options & 32', (err, rowCount) ->
      callback(err)
    )

    request.on('row', (columns) ->
      optionOn = columns[0].value == 32
      test.strictEqual(optionOn, expectedOptionOn)
    )

    connection.execSql(request)

  setAnsiNullsOptionOff = (callback) ->
    request = new Request('set ansi_nulls off', (err, rowCount) ->
      callback(err)
    )

    connection.execSqlBatch(request)

  connection = new Connection(config)

  connection.on('resetConnection', ->
    test.ok(true)
  )

  connection.on('connect', (err) ->
    async.series([
      testAnsiNullsOptionOn,
      setAnsiNullsOptionOff,
      testAnsiNullsOptionOff,
      (callback) ->
        connection.reset (err) ->
          if connection.config.options.tdsVersion < '7_2'
            # TDS 7_1 doesnt send RESETCONNECTION acknowledgement packet
            test.ok(true)

          callback err
      testAnsiNullsOptionOn,
      (callback) ->
        connection.close()
        callback()
    ])
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

exports.cancelRequest = (test) ->
  test.expect(8)

  config = getConfig()

  request = new Request('select 1 as C1;waitfor delay \'00:00:05\';select 2 as C2', (err, rowCount, rows) ->
      test.strictEqual err.message, 'Canceled.'

      connection.close()
  )

  request.on('doneInProc', (rowCount, more) ->
      test.ok false
  )

  request.on('doneProc', (rowCount, more) ->
      test.ok !rowCount
      test.strictEqual more, false
  )

  request.on('done', (rowCount, more, rows) ->
      test.ok !rowCount
      test.strictEqual more, false
  )

  request.on('columnMetadata', (columnsMetadata) ->
      test.strictEqual(columnsMetadata.length, 1)
  )

  request.on('row', (columns) ->
      test.strictEqual(columns.length, 1)
      test.strictEqual(columns[0].value, 1)
  )

  connection = new Connection(config)

  connection.on('connect', (err) ->
    connection.execSql(request)
    setTimeout(connection.cancel.bind(connection), 2000)
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

exports.requestTimeout = (test) ->
  test.expect(8)

  config = getConfig()
  config.options.requestTimeout = 1000

  request = new Request('select 1 as C1;waitfor delay \'00:00:05\';select 2 as C2', (err, rowCount, rows) ->
      test.equal err.message, 'Timeout: Request failed to complete in 1000ms'

      connection.close()
  )

  request.on('doneInProc', (rowCount, more) ->
      test.ok false
  )

  request.on('doneProc', (rowCount, more) ->
      test.ok !rowCount
      test.strictEqual more, false
  )

  request.on('done', (rowCount, more, rows) ->
      test.ok !rowCount
      test.strictEqual more, false
  )

  request.on('columnMetadata', (columnsMetadata) ->
      test.strictEqual(columnsMetadata.length, 1)
  )

  request.on('row', (columns) ->
      test.strictEqual(columns.length, 1)
      test.strictEqual(columns[0].value, 1)
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

runSqlBatch = (test, config, sql, requestCallback) ->
  connection = new Connection(config)

  request = new Request sql, ->
    requestCallback.apply this, arguments
    connection.close()

  connection.on 'connect', (err) ->
    test.ifError(err)
    connection.execSqlBatch(request)

  connection.on 'end', (info) ->
    test.done()

# Test that the default behavior allows adding null values to a
# temporary table where the nullability is not explicitly declared.
exports.testAnsiNullDefault = (test) ->
    test.expect(2)

    sql = """
      create table #testAnsiNullDefault (id int);
      insert #testAnsiNullDefault values (null);
      drop table #testAnsiNullDefault;
    """

    runSqlBatch test, getConfig(), sql, (err) ->
        test.ifError(err)

# Test that the default behavior can be overridden (so that temporary
# table columns are non-nullable by default).
exports.disableAnsiNullDefault = (test) ->
    test.expect(3)

    sql = """
      create table #testAnsiNullDefaults (id int);
      insert #testAnsiNullDefaults values (null);
      drop table #testAnsiNullDefaults;
    """

    config = getConfig()
    config.options.enableAnsiNullDefault = false

    runSqlBatch test, config, sql, (err) ->
        test.ok(err instanceof Error)
        test.strictEqual err?.number, 515 # Cannot insert the value NULL
