async = require('async')
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

config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION

exports.uniqueConstraint = (test) ->
  sql = """
  create table #testUnique (id int unique);
  insert #testUnique values (1), (2), (3);
  insert #testUnique values (2);
  drop table #testUnique;
  """

  test.expect(3)
  execSql test, sql, (err) ->
    test.ok(err instanceof Error)
    test.strictEqual(err.number, 2627)

exports.nullable = (test) ->
  sql = """
  create table #testNullable (id int not null);
  insert #testNullable values (null);
  drop table #testNullable;
  """

  test.expect(3)
  execSql test, sql, (err) ->
    test.ok(err instanceof Error)
    test.strictEqual(err.number, 515)

exports.cannotDropProcedure = (test) ->
  sql = """
  drop procedure #nonexistentProcedure;
  """

  test.expect(3)
  execSql test, sql, (err) ->
    test.ok(err instanceof Error)
    test.strictEqual(err.number, 3701)

# Create a temporary stored procedure to test that err.procName,
# err.lineNumber, err.class, and err.state are correct.
#
# We can't really test serverName reliably, other than that it exists.
exports.extendedErrorInfo = (test) ->
  connection = new Connection(config)

  test.expect(9)

  execProc = new Request "#testExtendedErrorInfo", (err) ->
    test.ok(err instanceof Error)

    test.strictEqual(err.number, 50000)
    test.strictEqual(err.state, 42, "err.state wrong")
    test.strictEqual(err.class, 14, "err.class wrong")

    test.ok(err.serverName?, "err.serverName not set")

    # The procedure name will actually be padded to 128 chars with underscores and
    # some random hexadecimal digits.
    test.ok(err.procName?.indexOf("#testExtendedErrorInfo") == 0,
      "err.procName should begin with #testExtendedErrorInfo, was actually #{err.procName}")
    test.strictEqual(err.lineNumber, 1, "err.lineNumber should be 1")

    connection.close()

  createProc = new Request "create procedure #testExtendedErrorInfo as raiserror('test error message', 14, 42)", (err) ->
    test.ifError(err)
    connection.callProcedure execProc

  connection.on 'connect', (err) ->
    test.ifError(err)
    connection.execSqlBatch(createProc)

  connection.on 'end', (info) ->
    test.done()

  if debug
    connection.on 'debug', (message) -> console.log(message)

execSql = (test, sql, requestCallback) ->
  connection = new Connection(config)

  request = new Request sql, ->
    requestCallback.apply this, arguments
    connection.close()

  connection.on 'connect', (err) ->
    test.ifError(err)
    connection.execSqlBatch(request)

  connection.on 'end', (info) ->
    test.done()

  if debug
    connection.on 'debug', (message) -> console.log(message)
