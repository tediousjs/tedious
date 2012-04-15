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

exports.tinyInt = (test) ->
  execSql(test, TYPES.TinyInt, 8)

exports.tinyIntNull = (test) ->
  execSql(test, TYPES.TinyInt, null)

exports.smallInt = (test) ->
  execSql(test, TYPES.SmallInt, 8)

exports.smallIntNull = (test) ->
  execSql(test, TYPES.SmallInt, null)

exports.int = (test) ->
  execSql(test, TYPES.Int, 8)

exports.intNull = (test) ->
  execSql(test, TYPES.Int, null)

exports.varChar = (test) ->
  execSql(test, TYPES.VarChar, 'qaz')

exports.varCharNull = (test) ->
  execSql(test, TYPES.VarChar, null)

exports.nVarChar = (test) ->
  execSql(test, TYPES.NVarChar, 'qaz')

exports.nVarCharNull = (test) ->
  execSql(test, TYPES.NVarChar, null)

exports.outputTinyInt = (test) ->
  execSqlOutput(test, TYPES.TinyInt, 3)

exports.outputTinyIntNull = (test) ->
  execSqlOutput(test, TYPES.TinyInt, null)

exports.outputSmallInt = (test) ->
  execSqlOutput(test, TYPES.SmallInt, 3)

exports.outputSmallIntNull = (test) ->
  execSqlOutput(test, TYPES.SmallInt, null)

exports.outputInt = (test) ->
  execSqlOutput(test, TYPES.Int, 3)

exports.outputIntNull = (test) ->
  execSqlOutput(test, TYPES.Int, null)

exports.outputVarChar = (test) ->
  execSqlOutput(test, TYPES.VarChar, 'qwerty')

exports.outputVarCharNull = (test) ->
  execSqlOutput(test, TYPES.VarChar, null)

exports.outputNVarChar = (test) ->
  execSqlOutput(test, TYPES.NVarChar, 'qwerty')

exports.outputNVarCharNull = (test) ->
  execSqlOutput(test, TYPES.NVarChar, null)

exports.multipleParameters = (test) ->
  test.expect(6)

  config = getConfig()

  request = new Request('select @param1, @param2', (err) ->
      test.ok(!err)

      connection.close()
  )

  request.addParameter('param1', TYPES.Int, 3)
  request.addParameter('param2', TYPES.VarChar, 'qwerty')

  request.on('doneInProc', (rowCount, more) ->
      test.ok(more)
      test.strictEqual(rowCount, 1)
  )

  request.on('row', (columns) ->
      test.strictEqual(columns.length, 2)
      test.strictEqual(columns[0].value, 3)
      test.strictEqual(columns[1].value, 'qwerty')
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

execSql = (test, type, value) ->
  test.expect(5)

  config = getConfig()

  request = new Request('select @param', (err) ->
      test.ok(!err)

      connection.close()
  )

  request.addParameter('param', type, value)

  request.on('doneInProc', (rowCount, more) ->
      test.ok(more)
      test.strictEqual(rowCount, 1)
  )

  request.on('row', (columns) ->
      test.strictEqual(columns.length, 1)
      test.strictEqual(columns[0].value, value)
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

execSqlOutput = (test, type, value) ->
  test.expect(6)

  config = getConfig()

  request = new Request('set @paramOut = @paramIn', (err) ->
      test.ok(!err)

      connection.close()
  )

  request.addParameter('paramIn', type, value)
  request.addOutputParameter('paramOut', type)

  request.on('doneInProc', (rowCount, more) ->
      test.ok(more)
      test.strictEqual(rowCount, 1)
  )

  request.on('returnValue', (name, returnValue, metadata) ->
    test.strictEqual(name, 'paramOut')
    test.strictEqual(returnValue, value)
    test.ok(metadata)
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
