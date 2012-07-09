Connection = require('../../src/connection')
Request = require('../../src/request')
fs = require('fs')
async = require('async')

debug = false

config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config

if (debug)
  config.options.debug =
    packet: true
    data: true
    payload: true
    token: true
    log: true
else
  config.options.debug = {}

class Tester
  constructor: (@test) ->
    @connection = new Connection(config)

    @connection.on('end', (info) =>
      @test.done()
    )

    @connection.on('errorMessage', (error) =>
      console.log("#{error.number} : #{error.message}")
    )

    @connection.on('debug', (message) =>
      if (debug)
        console.log(message)
    )

  createTable: (callback) =>
    request = new Request('create table #temp (id int)', (err) =>
      @test.ok(!err)
      callback(err)
    )

    @connection.execSqlBatch(request)

  insert: (callback) =>
    request = new Request('insert into #temp (id) values(1)', (err) =>
      @test.ok(!err)
      callback(err)
    )

    @connection.execSqlBatch(request)

  select: (callback, expectedRows) =>
    request = new Request('select id from #temp', (err, rowCount) =>
      @test.ok(!err)
      @test.strictEqual(rowCount, expectedRows)
      callback(err)
    )

    request.on('row', (columns) =>
        @test.strictEqual(columns[0].value, 1)
    )

    @connection.execSqlBatch(request)

  selectExpectZeroRows: (callback) =>
    @select(callback, 0)

  selectExpectOneRow: (callback) =>
    @select(callback, 1)

  beginTransaction: (callback) =>
    @connection.beginTransaction((err, transactionDescriptor) =>
      @test.ok(!err)
      @test.ok(transactionDescriptor)

      callback(err)
    , 'abc')

  commitTransaction: (callback) =>
    @connection.commitTransaction((err) =>
      @test.ok(!err)

      callback(err)
    )

  rollbackTransaction: (callback) =>
    @connection.rollbackTransaction((err) =>
      @test.ok(!err)

      callback(err)
    )

  close: (callback) =>
    @connection.close()

  run: (actions) =>
    @connection.on('connect', (err) =>
      async.series(actions)
    )

exports.beginCommit = (test) ->
  test.expect(8)

  tester = new Tester(test)
  tester.run([
    tester.createTable
    tester.beginTransaction
    tester.insert
    tester.commitTransaction
    tester.selectExpectOneRow
    tester.close
  ])

exports.beginRollback = (test) ->
  test.expect(7)

  tester = new Tester(test)
  tester.run([
    tester.createTable
    tester.beginTransaction
    tester.insert
    tester.rollbackTransaction
    tester.selectExpectZeroRows
    tester.close
  ])
