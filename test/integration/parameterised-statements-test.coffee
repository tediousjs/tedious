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

exports.tinyint = (test) ->
  execSql(test, TYPES.TinyInt, 8)

exports.tinyintNull = (test) ->
  execSql(test, TYPES.TinyInt, null)

exports.smallint = (test) ->
  execSql(test, TYPES.SmallInt, 8)

exports.smallintNull = (test) ->
  execSql(test, TYPES.SmallInt, null)

exports.int = (test) ->
  execSql(test, TYPES.Int, 8)

exports.intNull = (test) ->
  execSql(test, TYPES.Int, null)

exports.varchar = (test) ->
  execSql(test, TYPES.VarChar, 'qaz')

exports.varcharNull = (test) ->
  execSql(test, TYPES.VarChar, null)

exports.nvarchar = (test) ->
  execSql(test, TYPES.NVarChar, 'qaz')

exports.nvarcharNull = (test) ->
  execSql(test, TYPES.NVarChar, null)

execSql = (test, type, value) ->
  test.expect(5)

  config = getConfig()

  request = new Request('select @param', (err) ->
      test.ok(!err)

      connection.close()
  )

  request.addParameter(type, 'param', value)

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
