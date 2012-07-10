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

  createProc: (callback) =>
    request = new Request('''
      CREATE PROCEDURE #proc
      AS
        SET NOCOUNT ON;

        begin transaction
        insert into #temp (id) values(1)
        commit transaction
      GO'''
    , (err) =>
      @test.ok(!err)
      callback(err)
    )

    @connection.execSqlBatch(request)

  execProc: (callback) =>
    request = new Request('exec #proc', (err) =>
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

  beginTransaction: (callback, transactionName) =>
    @connection.beginTransaction((err, transactionDescriptor) =>
      @test.ok(!err)
      @test.ok(transactionDescriptor)

      callback(err)
    , transactionName)

  beginTransaction1: (callback) =>
    @beginTransaction(callback, 'one')

  beginTransaction2: (callback) =>
    @beginTransaction(callback, 'two')

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

exports.transactionCommit = (test) ->
  test.expect(8)

  tester = new Tester(test)
  tester.run([
    tester.createTable
    tester.beginTransaction1
    tester.insert
    tester.commitTransaction
    tester.selectExpectOneRow
    tester.close
  ])

exports.transactionRollback = (test) ->
  test.expect(7)

  tester = new Tester(test)
  tester.run([
    tester.createTable
    tester.beginTransaction1
    tester.insert
    tester.rollbackTransaction
    tester.selectExpectZeroRows
    tester.close
  ])

exports.nestedTransactionCommit = (test) ->
  test.expect(11)

  tester = new Tester(test)
  tester.run([
    tester.createTable
    tester.beginTransaction1
    tester.beginTransaction2
    tester.insert
    tester.commitTransaction
    tester.commitTransaction
    tester.selectExpectOneRow
    tester.close
  ])

exports.nestedTransactionRollbackOuter = (test) ->
  test.expect(10)

  tester = new Tester(test)
  tester.run([
    tester.createTable
    tester.beginTransaction1
    tester.beginTransaction2
    tester.insert
    tester.commitTransaction
    tester.rollbackTransaction
    tester.selectExpectZeroRows
    tester.close
  ])

exports.nestedTransactionInProcCommit = (test) ->
  test.expect(9)

  tester = new Tester(test)
  tester.run([
    tester.createTable
    tester.createProc
    tester.beginTransaction1
    tester.execProc
    tester.commitTransaction
    tester.selectExpectOneRow
    tester.close
  ])

exports.nestedTransactionInProcRollbackOuter = (test) ->
  test.expect(8)

  tester = new Tester(test)
  tester.run([
    tester.createTable
    tester.createProc
    tester.beginTransaction1
    tester.execProc
    tester.rollbackTransaction
    tester.selectExpectZeroRows
    tester.close
  ])
