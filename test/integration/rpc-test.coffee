Connection = require('../../src/connection')
Request = require('../../src/request')
TYPES = require('../../src/data-type').typeByName
fs = require('fs')

getConfig = ->
  config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config

  config.options.debug =
    packet: true
    data: true
    payload: true
    token: true
    log: true

  config

exports.execProcVarChar = (test) ->
  testProc(test, TYPES.VarChar, 'varchar(10)', 'test')

exports.execProcVarCharNull = (test) ->
  testProc(test, TYPES.VarChar, 'varchar(10)', null)

exports.execProcNVarChar = (test) ->
  testProc(test, TYPES.NVarChar, 'nvarchar(10)', 'test')

exports.execProcNVarCharNull = (test) ->
  testProc(test, TYPES.NVarChar, 'nvarchar(10)', null)

exports.execProcTinyInt = (test) ->
  testProc(test, TYPES.TinyInt, 'tinyint', 3)

exports.execProcTinyIntNull = (test) ->
  testProc(test, TYPES.TinyInt, 'tinyint', null)

exports.execProcSmallInt = (test) ->
  testProc(test, TYPES.SmallInt, 'smallint', 3)

exports.execProcSmallIntNull = (test) ->
  testProc(test, TYPES.SmallInt, 'smallint', null)

exports.execProcInt = (test) ->
  testProc(test, TYPES.Int, 'int', 3)

exports.execProcIntNull = (test) ->
  testProc(test, TYPES.Int, 'int', null)

exports.execProcSmallDateTime = (test) ->
  testProc(test, TYPES.SmallDateTime, 'smalldatetime', new Date('December 4, 2011 10:04:00'))

exports.execProcSmallDateTimeNull = (test) ->
  testProc(test, TYPES.SmallDateTime, 'smalldatetime', null)

exports.execProcDateTime = (test) ->
  testProc(test, TYPES.DateTime, 'datetime', new Date('December 4, 2011 10:04:23'))

exports.execProcDateTimeNull = (test) ->
  testProc(test, TYPES.DateTime, 'datetime', null)

exports.execProcOutputVarChar = (test) ->
  testProcOutput(test, TYPES.VarChar, 'varchar(10)', 'test')

exports.execProcOutputVarCharNull = (test) ->
  testProcOutput(test, TYPES.VarChar, 'varchar(10)', null)

exports.execProcOutputNVarChar = (test) ->
  testProcOutput(test, TYPES.NVarChar, 'varchar(10)', 'test')

exports.execProcOutputNVarCharNull = (test) ->
  testProcOutput(test, TYPES.NVarChar, 'varchar(10)', null)

exports.execProcOutputTinyInt = (test) ->
  testProcOutput(test, TYPES.TinyInt, 'tinyint', 3)

exports.execProcOutputTinyIntNull = (test) ->
  testProcOutput(test, TYPES.TinyInt, 'tinyint', null)

exports.execProcOutputSmallInt = (test) ->
  testProcOutput(test, TYPES.SmallInt, 'smallint', 3)

exports.execProcOutputSmallIntNull = (test) ->
  testProcOutput(test, TYPES.SmallInt, 'smallint', null)

exports.execProcOutputInt = (test) ->
  testProcOutput(test, TYPES.Int, 'int', 3)

exports.execProcOutputIntNull = (test) ->
  testProcOutput(test, TYPES.Int, 'int', null)

exports.execProcOutputSmallDateTime = (test) ->
  testProcOutput(test, TYPES.SmallDateTime, 'smalldatetime', new Date('December 4, 2011 10:04:00'))

exports.execProcOutputSmallDateTimeNull = (test) ->
  testProcOutput(test, TYPES.SmallDateTime, 'smalldatetime', null)

exports.execProcOutputDateTime = (test) ->
  testProcOutput(test, TYPES.DateTime, 'datetime', new Date('December 4, 2011 10:04:23'))

exports.execProcOutputDateTimeNull = (test) ->
  testProcOutput(test, TYPES.DateTime, 'datetime', null)

exports.execProcWithBadName = (test) ->
  test.expect(3)

  config = getConfig()

  request = new Request('bad_proc_name', (err) ->
    test.ok(err)

    connection.close()
  )

  request.on('doneProc', (rowCount, more, returnStatus) ->
    test.ok(!more)
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

exports.procReturnValue = (test) ->
  test.expect(3)

  config = getConfig()

  request = new Request('#test_proc', (err) ->
    connection.close()
  )

  request.on('doneProc', (rowCount, more, returnStatus) ->
    test.ok(!more)
    test.strictEqual(returnStatus, 1)   # Non-zero indicates a failure.
  )

  request.on('doneInProc', (rowCount, more) ->
    test.ok(more)
  )

  connection = new Connection(config)

  connection.on('connect', (err) ->
    execSqlBatch(test, connection,
      "
        CREATE PROCEDURE #test_proc
        AS
          return 1
      ",
      ->
        connection.callProcedure(request)
    )
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

execSqlBatch = (test, connection, sql, doneCallback) ->
  request = new Request(sql, (err) ->
    if err
      console.log err
      test.ok(false)

    doneCallback()
  )

  connection.execSqlBatch(request)

testProc = (test, type, typeAsString, value) ->
  test.expect(5)

  config = getConfig()

  request = new Request('#test_proc', (err) ->
    test.ok(!err)

    connection.close()
  )

  request.addParameter('param', type, value)

  request.on('doneProc', (rowCount, more, returnStatus) ->
    test.ok(!more)
    test.strictEqual(returnStatus, 0)
  )

  request.on('doneInProc', (rowCount, more) ->
    test.ok(more)
  )

  request.on('row', (columns) ->
      if (value instanceof Date)
        test.strictEqual(columns[0].value.getTime(), value.getTime())
      else
        test.strictEqual(columns[0].value, value)
  )

  connection = new Connection(config)

  connection.on('connect', (err) ->
    execSqlBatch(test, connection,
      "
        CREATE PROCEDURE #test_proc
          @param #{typeAsString}
        AS
          select @param
      ",
      ->
        connection.callProcedure(request)
    )
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('infoMessage', (info) ->
    #console.log("#{info.number} : #{info.message}")
  )

  connection.on('errorMessage', (error) ->
    console.log("#{error.number} : #{error.message}")
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )

testProcOutput = (test, type, typeAsString, value) ->
  test.expect(7)

  config = getConfig()

  request = new Request('#test_proc', (err) ->
    test.ok(!err)

    connection.close()
  )

  request.addParameter('paramIn', type, value)
  request.addOutputParameter('paramOut', type)

  request.on('doneProc', (rowCount, more, returnStatus) ->
    test.ok(!more)
    test.strictEqual(returnStatus, 0)
  )

  request.on('doneInProc', (rowCount, more) ->
    test.ok(more)
  )

  request.on('returnValue', (name, returnValue, metadata) ->
    test.strictEqual(name, 'paramOut')
    if (value instanceof Date)
      test.strictEqual(returnValue.getTime(), value.getTime())
    else
      test.strictEqual(returnValue, value)
    test.ok(metadata)
  )

  connection = new Connection(config)

  connection.on('connect', (err) ->
    execSqlBatch(test, connection,
      "
        CREATE PROCEDURE #test_proc
          @paramIn #{typeAsString},
          @paramOut #{typeAsString} output
        AS
          set @paramOut = @paramIn
      ",
      ->
        connection.callProcedure(request)
    )
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('infoMessage', (info) ->
    #console.log("#{info.number} : #{info.message}")
  )

  connection.on('errorMessage', (error) ->
    console.log("#{error.number} : #{error.message}")
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )
