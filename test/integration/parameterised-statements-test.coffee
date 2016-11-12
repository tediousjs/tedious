Connection = require('../../src/connection')
Request = require('../../src/request')
fs = require('fs')
guidParser = require('../../src/guid-parser')
TYPES = require('../../src/data-type').typeByName

getConfig = ->
  config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config

  config.options.debug =
    packet: true
    data: true
    payload: true
    token: true
    log: true

  config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION

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

exports.tinyIntLarge = (test) ->
  execSql(test, TYPES.TinyInt, 252)

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

exports.bigint = (test) ->
  execSql(test, TYPES.BigInt, 9007199254740992)

exports.bigint1 = (test) ->
  execSql(test, TYPES.BigInt, 1)

exports.bigintsmall = (test) ->
  execSql(test, TYPES.BigInt, -9007199254740992)

exports.bigintsmall1 = (test) ->
  execSql(test, TYPES.BigInt, -1)

exports.real = (test) ->
  execSql(test, TYPES.Real, 9654.2529296875)

exports.float = (test) ->
  execSql(test, TYPES.Float, 9654.2546456567565767644)

exports.numeric = (test) ->
  execSql(test, TYPES.Numeric, 5555)

exports.numericLargeValue = (test) ->
  execSql(test, TYPES.Numeric, 5.555555555555553333, null, {precision: 19, scale: 18})

exports.numericNegative = (test) ->
  execSql(test, TYPES.Numeric, -5555.55, null, {precision: 6, scale: 2})

exports.decimal = (test) ->
  execSql(test, TYPES.Decimal, 5555)

exports.decimalLargeValue = (test) ->
  execSql(test, TYPES.Decimal, 5.555555555555553333, null, {precision: 19, scale: 18})

exports.decimalNegative = (test) ->
  execSql(test, TYPES.Decimal, -5555.55, null, {precision: 6, scale: 2})

exports.smallMoney = (test) ->
  execSql(test, TYPES.SmallMoney, 9842.4566)

exports.money = (test) ->
  execSql(test, TYPES.Money, 956455842.4566)

exports.uniqueIdentifierN = (test) ->
  execSql(test, TYPES.UniqueIdentifierN, '01234567-89AB-CDEF-0123-456789ABCDEF')

exports.intZero = (test) ->
  execSql(test, TYPES.Int, 0)

exports.intNull = (test) ->
  execSql(test, TYPES.Int, null)

exports.varChar = (test) ->
  execSql(test, TYPES.VarChar, 'qaz')

### Per 2.2.5.4.3, lengths greater than 8000 only supported version 7.2 and beyond. ###
exports.varCharN = (test) ->
  execSql(test, TYPES.VarChar, 'qaz', null, {length: 8000})

exports.varCharN_7_2_AndLater = (test) ->
  execSql(test, TYPES.VarChar, 'qaz', '7_2', {length: 8001})

exports.varCharEmptyString = (test) ->
  execSql(test, TYPES.VarChar, '')

exports.varCharNull = (test) ->
  execSql(test, TYPES.VarChar, null)

exports.varCharMax = (test) ->
  longString = ''
  for i in [1..(10 * 1000)]
    longString += 'x'

  execSql(test, TYPES.VarChar, longString, '7_2')

exports.varCharMaxEmptyString = (test) ->
  execSql(test, TYPES.VarChar, '', null, {length: 8000})

exports.varCharMaxEmptyString = (test) ->
  execSql(test, TYPES.VarChar, '', '7_2', {length: 8001})

exports.nVarChar = (test) ->
  execSql(test, TYPES.NVarChar, 'qaz')

###
Per 2.2.5.4.3, lengths greater than 8000 only supported version 7.2 and
beyond. Since NVarChar is unicode, that'd be 4000. More explict in:
https://msdn.microsoft.com/en-us/library/ms186939.aspx
###
exports.nVarCharN = (test) ->
  execSql(test, TYPES.NVarChar, 'qaz', null, {length: 4000})

exports.nVarCharN_7_2_AndLater = (test) ->
  execSql(test, TYPES.NVarChar, 'qaz', '7_2', {length: 4001})

exports.nVarCharEmptyString = (test) ->
  execSql(test, TYPES.NVarChar, '')

exports.nVarCharNull = (test) ->
  execSql(test, TYPES.NVarChar, null)

exports.nVarCharMax = (test) ->
  longString = ''
  for i in [1..(10 * 1000)]
    longString += 'x'

  execSql(test, TYPES.NVarChar, longString, '7_2')

exports.nVarCharMaxEmptyString = (test) ->
  execSql(test, TYPES.NVarChar, '', null, {length: 4000})

exports.nVarCharMaxEmptyString_7_2_AndLater = (test) ->
  execSql(test, TYPES.NVarChar, '', '7_2', {length: 4001})

exports.Char = (test) ->
  execSql(test, TYPES.Char, 'qaz')

exports.CharN = (test) ->
  execSql(test, TYPES.Char, 'qaz', null, {length: 3})

exports.CharNull = (test) ->
  execSql(test, TYPES.Char, null)

exports.NChar = (test) ->
  execSql(test, TYPES.NChar, 'qaz')

exports.NCharN = (test) ->
  execSql(test, TYPES.NChar, 'qaz', null, {length: 3})

exports.NCharNull = (test) ->
  execSql(test, TYPES.NChar, null)

exports.textNull = (test) ->
  execSql(test, TYPES.Text, null)

exports.textEmpty = (test) ->
  execSql(test, TYPES.Text, '')

exports.textSmall = (test) ->
  execSql(test, TYPES.Text, 'small')

exports.textLarge = (test) ->
  dBuf = new Buffer(500000)
  dBuf.fill('x')
  execSql(test, TYPES.Text, dBuf.toString())

exports.smallDateTime = (test) ->
  execSql(test, TYPES.SmallDateTime, new Date('December 4, 2011 10:04:00'))

exports.smallDateTimeNull = (test) ->
  execSql(test, TYPES.SmallDateTime, null)

exports.dateTime = (test) ->
  execSql(test, TYPES.DateTime, new Date('December 4, 2011 10:04:23'))

exports.dateTimeNull = (test) ->
  execSql(test, TYPES.DateTime, null)

exports.dateTime2 = (test) ->
  execSql(test, TYPES.DateTime2, new Date('December 4, 2011 10:04:23'), '7_3_A')

exports.dateTime2Null = (test) ->
  execSql(test, TYPES.DateTime2, null, '7_3_A')

exports.outputBitTrue = (test) ->
  execSqlOutput(test, TYPES.Bit, true)

exports.outputBitFalse = (test) ->
  execSqlOutput(test, TYPES.Bit, false)

exports.outputBitNull = (test) ->
  execSqlOutput(test, TYPES.Bit, null)

exports.outputTinyInt = (test) ->
  execSqlOutput(test, TYPES.TinyInt, 3)

exports.outputTinyIntLarge = (test) ->
  execSqlOutput(test, TYPES.TinyInt, 252)

exports.outputTinyIntNull = (test) ->
  execSqlOutput(test, TYPES.TinyInt, null)

exports.outputSmallInt = (test) ->
  execSqlOutput(test, TYPES.SmallInt, 3)

exports.outputSmallIntNull = (test) ->
  execSqlOutput(test, TYPES.SmallInt, null)

exports.outputInt = (test) ->
  execSqlOutput(test, TYPES.Int, 3)

exports.outputBigInt = (test) ->
  execSqlOutput(test, TYPES.BigInt, 9007199254740992)

exports.outputBigInt1 = (test) ->
  execSqlOutput(test, TYPES.BigInt, 1)

exports.outputBigIntSmall = (test) ->
  execSqlOutput(test, TYPES.BigInt, -9007199254740992)

exports.outputBigIntSmall1 = (test) ->
  execSqlOutput(test, TYPES.BigInt, -1)

exports.outputFloat = (test) ->
  execSqlOutput(test, TYPES.Float, 9654.2546456567565767644)

exports.outputUniqueIdentifierN = (test) ->
  execSqlOutput(test, TYPES.UniqueIdentifierN, '01234567-89AB-CDEF-0123-456789ABCDEF')

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
  test.expect(7)

  config = getConfig()

  request = new Request('select @param1, @param2', (err) ->
      test.ifError(err)

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
      test.ifError(err)
      connection.execSql(request)
  )

  connection.on('end', (info) ->
      test.done()
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )

exports.callProcedureWithParameters = (test) ->
  test.expect(13)

  config = getConfig()

  setupSql = """
    if exists (select * from sys.procedures where name = '__test5')
      exec('drop procedure [dbo].[__test5]')

    exec('create procedure [dbo].[__test5]
      @in BINARY(4),
      @in2 BINARY(4) = NULL,
      @in3 VARBINARY(MAX),
      @in4 VARBINARY(MAX) = NULL,
      @in5 IMAGE,
      @in6 IMAGE = NULL,
      @out BINARY(4) = NULL OUTPUT,
      @out2 VARBINARY(MAX) = NULL OUTPUT
    as
    begin

      set nocount on

      select CAST( 123456 AS BINARY(4) ) as ''bin'', @in as ''in'', @in2 as ''in2'', @in3 as ''in3'', @in4 as ''in4'', @in5 as ''in5'', @in6 as ''in6''

      set @out = @in
      set @out2 = @in3

      return 0

    end')
  """

  request = new Request setupSql, (err) ->
    test.ifError (err)

    request = new Request('__test5', (err) ->
        test.ifError(err)

        connection.close()
    )

    sample = new Buffer([0x00, 0x01, 0xe2, 0x40])

    request.addParameter 'in', TYPES.Binary, sample
    request.addParameter 'in2', TYPES.Binary, null
    request.addParameter 'in3', TYPES.VarBinary, sample
    request.addParameter 'in4', TYPES.VarBinary, null
    request.addParameter 'in5', TYPES.Image, sample
    request.addParameter 'in6', TYPES.Image, null
    request.addOutputParameter 'out', TYPES.Binary, null, { length: 4 }
    request.addOutputParameter 'out2', TYPES.VarBinary

    request.on('doneInProc', (rowCount, more) ->
      test.strictEqual(rowCount, undefined)
      test.ok(more)
    )

    request.on('row', (columns) ->
      test.strictEqual(columns.length, 7)
      test.deepEqual(columns[0].value, sample)
      test.deepEqual(columns[1].value, sample)
      test.strictEqual(columns[2].value, null)
      test.deepEqual(columns[3].value, sample)
      test.strictEqual(columns[4].value, null)
      test.deepEqual(columns[5].value, sample)
      test.strictEqual(columns[6].value, null)
    )

    connection.callProcedure(request)

  connection = new Connection(config)

  connection.on('connect', (err) ->
      test.ifError(err)
      connection.execSqlBatch(request)
  )

  connection.on('end', (info) ->
      test.done()
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )

execSql = (test, type, value, tdsVersion, options) ->

  config = getConfig()
  #config.options.packetSize = 32768

  if tdsVersion and tdsVersion > config.options.tdsVersion
    return test.done()

  test.expect(6)

  request = new Request('select @param', (err) ->
      test.ifError(err)

      connection.close()
  )

  request.addParameter('param', type, value, options)

  request.on('doneInProc', (rowCount, more) ->
      test.ok(more)
      test.strictEqual(rowCount, 1)
  )

  request.on('row', (columns) ->
      test.strictEqual(columns.length, 1)

      if (value instanceof Date)
        test.strictEqual(columns[0].value.getTime(), value.getTime())
      else if (type == TYPES.BigInt)
        test.strictEqual(columns[0].value, value.toString())
      else if (type == TYPES.UniqueIdentifierN)
        test.deepEqual(columns[0].value, value)
      else
        test.strictEqual(columns[0].value, value)
  )

  connection = new Connection(config)

  connection.on('connect', (err) ->
      test.ifError(err)
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
  test.expect(7)

  config = getConfig()

  request = new Request('set @paramOut = @paramIn', (err) ->
      test.ifError(err)

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
    else if (type == TYPES.BigInt)
      test.strictEqual(returnValue, value.toString())
    else if (type == TYPES.UniqueIdentifierN)
      test.deepEqual(returnValue, value)
    else
      test.strictEqual(returnValue, value)

    test.ok(metadata)
  )

  connection = new Connection(config)

  connection.on('connect', (err) ->
      test.ifError(err)
      connection.execSql(request)
  )

  connection.on('end', (info) ->
      test.done()
  )

  connection.on('debug', (text) ->
    # console.log(text)
  )
