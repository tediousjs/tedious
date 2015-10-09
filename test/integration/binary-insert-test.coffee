async = require('async')
Connection = require('../../src/connection')
Request = require('../../src/request')
fs = require('fs')
TYPES = require('../../src/data-type').typeByName

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

exports.insertBinary = (test) ->
  sample = new Buffer [0x12, 0x34, 0x00, 0xce]
  stmts = [
    ["create table binaryInsertTest (data binary(4))"],
    ["insert into binaryInsertTest (data) values (@p1)", [['p1', TYPES.Binary, sample]]],
    ["select data from binaryInsertTest", [], [[sample]]],
    ["drop table binaryInsertTest"]]
  test.expect 7
  testSqls test, stmts

testSqls = (test, stmts) ->
  connection = new Connection config
  connection.on 'connect', (err) ->
    test.ifError err
    testOne = () ->
      stmt = stmts.shift()
      if stmt
        request = new Request stmt[0], (err) ->
          test.ifError err
          testOne()
        request.addParameter.apply(request, p) for p in (stmt[1] or [])
        connection.execSql request
        request.on 'row', (columns) ->
          row = stmt[2].shift()
          if Buffer.isBuffer row[0]
            test.strictEqual columns[0].value.toString('hex'), row[0].toString('hex')
          else
            test.strictEqual columns[0].value, row[0]
      else
        test.strictEqual stmts.length, 0
        connection.close()
    testOne()
  
  connection.on 'end', (info) ->
    test.done()

