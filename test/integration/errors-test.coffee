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

exports.uniqueConstraint = (test) ->
  sql = """
  create table #testUnique (id int unique);
  insert #testUnique values (1), (2), (3);
  insert #testUnique values (2);
  drop table #testUnique;
  """

  test.expect(2)
  execSql test, sql, (err) ->
    test.ok(err instanceof Error)
    test.strictEqual(err.number, 2627)
    
exports.ansiNullDefaults = (test) ->
  sql = """
  create table #testAnsiNullDefault (id int);
  insert #testAnsiNullDefault values (null);
  drop table #testAnsiNullDefault;
  """

  test.expect(2)
  execSql test, sql, (err) ->
    test.ok(err instanceof Error)
    test.strictEqual(err.number, 515)
    
exports.cannotDropProcedure = (test) ->
  sql = """
  drop procedure #nonexistentProcedure;
  """

  test.expect(2)
  execSql test, sql, (err) ->
    test.ok(err instanceof Error)
    test.strictEqual(err.number, 3701)

# Create a temporary stored procedure to test that err.procName and
# err.lineNumber are correct.
# We can't really test much else reliably, other than that they exist.
exports.extendedErrorInfo = (test) ->
  connection = new Connection(config)

  test.expect(9)

  execProc = new Request "#divideByZero", (err) ->
    test.ok(err instanceof Error)
    test.strictEqual(err.number, 8134)
      
    # It doesn't look like there's any guarantee that error state values
    # will be kept the same across different versions of SQL Server, so
    # it's probably best to just test that it's not null.
    test.ok(err.state?, "err.state not set")
    test.ok(err.class?, "err.class not set")
    test.ok(err.serverName?, "err.serverName not set")
    # The procedure name will actually be padded to 128 chars with underscores and
    # some random hexadecimal digits.
    test.ok(err.procName?.indexOf("#divideByZero") == 0,
      "err.procName should begin with #divideByZero, was actually #{err.procName}")
    test.strictEqual(err.lineNumber, 1, "err.lineNumber should be 1")
      
    connection.close()

  createProc = new Request "create procedure #divideByZero as select 1/0 as x", (err) ->
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
    if (err)
      console.log err
    else
      connection.execSqlBatch(request)

  connection.on 'end', (info) ->
    test.done()

  if debug 
    connection.on 'debug', (message) -> console.log(message)
