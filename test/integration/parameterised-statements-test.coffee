Connection = require('../../src/connection')
Request = require('../../src/request')
fs = require('fs')
TYPES = require('../../src/data-type').typeByName

getConfig = ->
  config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config

  config.options.debug =
    packet: false
    data: false
    payload: true
    token: false
    log: false

  config

exports.bitTrue = (test) ->
  execSql(test, TYPES.Bit, true)

exports.bitFalse = (test) ->
  execSql(test, TYPES.Bit, false)

exports.bitNull = (test) ->
  execSql(test, TYPES.Bit, null)

exports.tinyInt = (test) ->
  execSql(test, TYPES.TinyInt, 8)

exports.tinyIntZero = (test) ->
  execSql(test, TYPES.TinyInt, 0)

exports.tinyIntNull = (test) ->
  execSql(test, TYPES.TinyInt, null)

exports.smallInt = (test) ->
  execSql(test, TYPES.SmallInt, 8)

exports.smallIntZero = (test) ->
  execSql(test, TYPES.SmallInt, 0)

exports.smallIntNull = (test) ->
  execSql(test, TYPES.SmallInt, null)

exports.int = (test) ->
  execSql(test, TYPES.Int, 8)

exports.intZero = (test) ->
  execSql(test, TYPES.Int, 0)

exports.intNull = (test) ->
  execSql(test, TYPES.Int, null)

exports.varChar = (test) ->
  execSql(test, TYPES.VarChar, 'qaz')

exports.varCharEmptyString = (test) ->
  execSql(test, TYPES.VarChar, '')

exports.varCharNull = (test) ->
  execSql(test, TYPES.VarChar, null)

exports.varCharMax = (test) ->
  longString = ''
  for i in [1..(10 * 1000)]
    longString += 'x'

  execSql(test, TYPES.VarChar, longString)

exports.nVarChar = (test) ->
  execSql(test, TYPES.NVarChar, 'qaz')

exports.nVarCharEmptyString = (test) ->
  execSql(test, TYPES.NVarChar, '')

exports.nVarCharNull = (test) ->
  execSql(test, TYPES.NVarChar, null)

exports.nVarCharMax = (test) ->
  longString = ''
  for i in [1..(10 * 1000)]
    longString += 'x'

  execSql(test, TYPES.NVarChar, longString)

exports.smallDateTime = (test) ->
  execSql(test, TYPES.SmallDateTime, new Date('December 4, 2011 10:04:00'))

exports.smallDateTimeNull = (test) ->
  execSql(test, TYPES.SmallDateTime, null)

exports.dateTime = (test) ->
  execSql(test, TYPES.DateTime, new Date('December 4, 2011 10:04:23'))

exports.dateTimeNull = (test) ->
  execSql(test, TYPES.DateTime, null)

exports.outputBitTrue = (test) ->
  execSqlOutput(test, TYPES.Bit, true)

exports.outputBitFalse = (test) ->
  execSqlOutput(test, TYPES.Bit, false)

exports.outputBitNull = (test) ->
  execSqlOutput(test, TYPES.Bit, null)

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

exports.outputSmallDateTime = (test) ->
  execSqlOutput(test, TYPES.SmallDateTime, new Date('December 4, 2011 10:04:00'))

exports.outputSmallDateTimeNull = (test) ->
  execSqlOutput(test, TYPES.SmallDateTime, null)

exports.outputDateTime = (test) ->
  execSqlOutput(test, TYPES.DateTime, new Date('December 4, 2011 10:04:23'))

exports.outputDateTimeNull = (test) ->
  execSqlOutput(test, TYPES.DateTime, null)

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
  #config.options.packetSize = 32768

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

      if (value instanceof Date)
        test.strictEqual(columns[0].value.getTime(), value.getTime())
      else
        test.strictEqual(columns[0].value, value)
  )

  connection = new Connection(config)

  connection.on('connect', (err) ->
      connection.execSql(request)
  )

  connection.on('end', (info) ->
      test.done()
  )

  connection.on('errorMessage', (error) ->
    console.log("#{error.number} : #{error.message}")
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

    if (value instanceof Date)
      test.strictEqual(returnValue.getTime(), value.getTime())
    else
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
