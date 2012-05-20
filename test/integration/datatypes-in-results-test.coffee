Connection = require('../../src/connection')
Request = require('../../src/request')
fs = require('fs')

debug = false

config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config
config.options.textsize = 8 * 1024

if (debug)
  config.options.debug =
    packet: true
    data: true
    payload: true
    token: true
    log: true
else
  config.options.debug = {}

exports.null = (test) ->
  execSql(test, 'select null', null)

exports.tinyint = (test) ->
  execSql(test, 'select cast(8 as tinyint)', 8)

exports.tinyintNull = (test) ->
  execSql(test, 'select cast(null as tinyint)', null)

exports.smallint = (test) ->
  execSql(test, 'select cast(8 as smallint)', 8)

exports.smallintNull = (test) ->
  execSql(test, 'select cast(null as smallint)', null)

exports.int = (test) ->
  execSql(test, 'select cast(8 as int)', 8)

exports.intNull = (test) ->
  execSql(test, 'select cast(null as int)', null)

exports.real = (test) ->
  execSql(test, 'select cast(9.5 as real)', 9.5)

exports.realNull = (test) ->
  execSql(test, 'select cast(null as real)', null)

exports.float = (test) ->
  execSql(test, 'select cast(9.5 as float)', 9.5)

exports.floatNull = (test) ->
  execSql(test, 'select cast(null as float)', null)

exports.bigint = (test) ->
  execSql(test, 'select cast(8 as bigint)', '8')

exports.bigintNull = (test) ->
  execSql(test, 'select cast(null as bigint)', null)

exports.bitFalse = (test) ->
  execSql(test, "select cast('false' as bit)", false)

exports.bitTrue = (test) ->
  execSql(test, "select cast('true' as bit)", true)

exports.bitNull = (test) ->
  execSql(test, "select cast(null as bit)", null)

exports.datetime = (test) ->
  execSql(test, "select cast('2011-12-4 10:04:23' as datetime)", new Date('December 4, 2011 10:04:23'))

exports.datetimeNull = (test) ->
  execSql(test, "select cast(null as datetime)", null)

exports.smallDatetime = (test) ->
  execSql(test, "select cast('2011-12-4 10:04:23' as smalldatetime)", new Date('December 4, 2011 10:04:00'))

exports.smallDatetimeNull = (test) ->
  execSql(test, "select cast(null as smalldatetime)", null)

exports.numericSmallValue = (test) ->
  execSql(test, "select cast(9.3 as numeric(3,2))", 9.3)

exports.numericLargeValue = (test) ->
  execSql(test, "select cast(9876543.3456 as numeric(12,5))", 9876543.3456)

exports.numericVeryLargeValue = (test) ->
  execSql(test, "select cast(9876543219876543.3456 as numeric(25,5))", 9876543219876543.3456)

exports.numericExtremelyLargeValue = (test) ->
  execSql(test, "select cast(98765432198765432198765432.3456 as numeric(35,5))", 98765432198765432198765432.3456)

exports.numericNull = (test) ->
  execSql(test, "select cast(null as numeric(3,2))", null)

exports.smallMoney = (test) ->
  execSql(test, "select cast(1.22229 as smallmoney)", 1.2223)

exports.smallMoneyNegative = (test) ->
  execSql(test, "select cast(-1.22229 as smallmoney)", -1.2223)

exports.smallMoneyNull = (test) ->
  execSql(test, "select cast(null as smallmoney)", null)

exports.money = (test) ->
  execSql(test, "select cast(1.22229 as money)", 1.2223)

exports.moneyNegative = (test) ->
  execSql(test, "select cast(-1.22229 as money)", -1.2223)

exports.moneyLarge = (test) ->
  execSql(test, "select cast(123456789012345.11 as money)", 123456789012345.11)

exports.moneyLargeNegative = (test) ->
  execSql(test, "select cast(-123456789012345.11 as money)", -123456789012345.11)

exports.moneyNull = (test) ->
  execSql(test, "select cast(null as money)", null)

exports.varchar = (test) ->
  execSql(test, "select cast('abcde' as varchar(10))", 'abcde')

exports.varcharNull = (test) ->
  execSql(test, "select cast(null as varchar(10))", null)

exports.varcharCollation = (test) ->
  # The codepage used is WINDOWS-1251.
  sql = """
    create table #tab1 (col1 nvarchar(10) collate Cyrillic_General_CS_AS);
    insert into #tab1 values(N'abcdШ');
    select cast(col1 as varchar(10)) from #tab1
    """
  execSql(test, sql, 'abcdШ')

exports.varcharMax = (test) ->
  execSql(test, "select cast('abc' as varchar(max))", 'abc')

exports.varcharMaxNull = (test) ->
  execSql(test, "select cast(null as varchar(max))", null)

exports.varcharMaxLongAsTextSize = (test) ->
  longString = ''
  for i in [1..config.options.textsize]
    longString += 'x'

  execSql(test, "select cast('#{longString}' as varchar(max))", longString)

exports.varcharMaxLargerThanTextSize = (test) ->
  longString = ''
  for i in [1..config.options.textsize + 10]
    longString += 'x'

  execSql(test, "select cast('#{longString}' as varchar(max))", longString.slice(0, config.options.textsize))

exports.nvarchar = (test) ->
  execSql(test, "select cast('abc' as nvarchar(10))", 'abc')

exports.nvarcharNull = (test) ->
  execSql(test, "select cast(null as nvarchar(10))", null)

exports.nvarcharMax = (test) ->
  execSql(test, "select cast('abc' as nvarchar(max))", 'abc')

exports.nvarcharMaxNull = (test) ->
  execSql(test, "select cast(null as nvarchar(max))", null)

exports.varbinary = (test) ->
  execSql(test, "select cast(0x1234 as varbinary(4))", [0x12, 0x34])

exports.varbinaryNull = (test) ->
  execSql(test, "select cast(null as varbinary(10))", null)

exports.binary = (test) ->
  execSql(test, "select cast(0x1234 as binary(4))", [0x12, 0x34, 0x00, 0x00])

exports.binaryNull = (test) ->
  execSql(test, "select cast(null as binary(10))", null)

exports.varbinaryMax = (test) ->
  execSql(test, "select cast(0x1234 as varbinary(max))", [0x12, 0x34])

exports.varbinaryMaxNull = (test) ->
  execSql(test, "select cast(null as varbinary(max))", null)

exports.char = (test) ->
  execSql(test, "select cast('abc' as char(5))", 'abc  ')

exports.charNull = (test) ->
  execSql(test, "select cast(null as char(5))", null)

exports.nchar = (test) ->
  execSql(test, "select cast('abc' as nchar(5))", 'abc  ')

exports.ncharNull = (test) ->
  execSql(test, "select cast(null as nchar(5))", null)

exports.text = (test) ->
  execSql(test, "select cast('abc' as text) as text", 'abc')

exports.textNull = (test) ->
  execSql(test, "select cast(null as text) as text", null)

exports.ntext = (test) ->
  execSql(test, "select cast('abc' as ntext) as text", 'abc')

exports.ntextNull = (test) ->
  execSql(test, "select cast(null as ntext) as text", null)

exports.image = (test) ->
  execSql(test, "select cast(0x1234 as image)", [0x12, 0x34])

exports.imageNull = (test) ->
  execSql(test, "select cast(null as image)", null)

exports.guid = (test) ->
  execSql(test, "select cast('01234567-89AB-CDEF-0123-456789ABCDEF' as uniqueidentifier)", [
    0x67, 0x45, 0x23, 0x01, 0xAB, 0x89, 0xEF, 0xCD,
    0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF
  ])

exports.guidNull = (test) ->
  execSql(test, "select cast(null as uniqueidentifier)", null)

execSql = (test, sql, expectedValue) ->
  test.expect(2)

  request = new Request(sql, (err) ->
    test.ok(!err)

    connection.close()
  )

  request.on('row', (columns) ->
    if expectedValue instanceof Date
      test.strictEqual(columns[0].value.getTime(), expectedValue.getTime())
    else if expectedValue instanceof Array
      test.deepEqual(columns[0].value, expectedValue)
    else
      test.strictEqual(columns[0].value, expectedValue)
  )

  connection = new Connection(config)

  connection.on('connect', (err) ->
    if (err)
      console.log err
    else
      connection.execSqlBatch(request)
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('errorMessage', (error) ->
    console.log("#{error.number} : #{error.message}")
  )

  connection.on('debug', (message) ->
    if (debug)
      console.log(message)
  )
