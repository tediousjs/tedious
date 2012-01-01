Connection = require('../../lib/connection')
Request = require('../../lib/request')
fs = require('fs')

config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8'))
config.options.debug =
  data: true
  payload: true
  token: true

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

exports.varchar = (test) ->
  execSql(test, "select cast('abc' as varchar(10))", 'abc')

exports.varcharNull = (test) ->
  execSql(test, "select cast(null as varchar(10))", null)

exports.varcharMax = (test) ->
  execSql(test, "select cast('abc' as varchar(max))", 'abc')

exports.varcharMaxNull = (test) ->
  execSql(test, "select cast(null as varchar(max))", null)

exports.nvarchar = (test) ->
  execSql(test, "select cast('abc' as nvarchar(10))", 'abc')

exports.nvarcharNull = (test) ->
  execSql(test, "select cast(null as nvarchar(10))", null)

exports.nvarcharMax = (test) ->
  execSql(test, "select cast('abc' as nvarchar(max))", 'abc')

exports.nvarcharMaxNull = (test) ->
  execSql(test, "select cast(null as nvarchar(max))", null)

exports.char = (test) ->
  execSql(test, "select cast('abc' as char(5))", 'abc  ')

exports.charNull = (test) ->
  execSql(test, "select cast(null as char(5))", null)

exports.nchar = (test) ->
  execSql(test, "select cast('abc' as nchar(5))", 'abc  ')

exports.ncharNull = (test) ->
  execSql(test, "select cast(null as nchar(5))", null)


execSql = (test, sql, expectedValue) ->
  test.expect(3)

  request = new Request(sql, (err, rowCount) ->
    test.ok(!err)
    test.done()
  )

  request.on('row', (columns) ->
    if expectedValue == null
      test.ok(columns[0].isNull)
    else if expectedValue instanceof Date
      test.strictEqual(columns[0].value.getTime(), expectedValue.getTime())
    else
      test.strictEqual(columns[0].value, expectedValue)
  )

  connection = new Connection(config.server, config.userName, config.password, config.options, (err, loggedIn) ->
    test.ok(!err)

    connection.execSql(request)
  )

  connection.on('error', (message) ->
    console.log(message)
  )

  connection.on('debug', (message) ->
    #console.log(message)
  )
