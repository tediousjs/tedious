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
