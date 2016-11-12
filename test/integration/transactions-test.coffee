Connection = require('../../src/connection')
Request = require('../../src/request')
Transaction = require('../../src/transaction')

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

config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION

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
      @test.ifError(err)
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
      @test.ifError(err)
      callback(err)
    )

    @connection.execSqlBatch(request)

  execProc: (callback) =>
    request = new Request('exec #proc', (err) =>
      @test.ifError(err)
      callback(err)
    )

    @connection.execSqlBatch(request)

  insert: (callback) =>
    request = new Request('insert into #temp (id) values(1)', (err) =>
      @test.ifError(err)
      callback(err)
    )

    @connection.execSqlBatch(request)

  select: (callback, expectedRows) =>
    request = new Request('select id from #temp', (err, rowCount) =>
      @test.ifError(err)
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
      @test.ifError(err)
      @test.ok(if config.options.tdsVersion < '7_2' then true else transactionDescriptor)

      callback(err)
    , transactionName)

  beginTransaction1: (callback) =>
    @beginTransaction(callback, 'one')

  beginTransaction2: (callback) =>
    @beginTransaction(callback, 'two')

  commitTransaction: (callback) =>
    @connection.commitTransaction((err) =>
      @test.ifError(err)

      callback(err)
    )

  rollbackTransaction: (callback) =>
    @connection.rollbackTransaction((err) =>
      @test.ifError(err)

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

exports.firesRollbackTransactionEventWithXactAbort = (test) ->
  # From 2.2.7.8, ENVCHANGE_TOKEN type Begin Transaction (8) is only supported
  # in TDS version 7.2 and above. 'rollbackTransaction' event fires in response
  # to that token type and hence won't be firing for lower versions.
  if config.options.tdsVersion < '7_2'
    test.expect(4)
  else
    test.expect(5)

  connection = new Connection(config)
  connection.on('end', (info) => test.done())
#  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
#  connection.on('debug', (message) => console.log(message))

  connection.on 'connect', (err) ->
    req = new Request("create table #temp (value varchar(50))", (err) ->
      test.ifError(err)

      req = new Request("SET XACT_ABORT ON", (err) ->
        test.ifError(err)

        connection.beginTransaction (err) ->
          test.ifError(err)

          connection.on "rollbackTransaction", ->
            # Ensure rollbackTransaction event is fired
            test.ok(true)

          req = new Request("insert into #temp values ('asdfasdfasdfasdfasdfasdfasdfasdfasdfasdfasdfasdfasd')", (err) ->
            test.strictEqual(err.message, "String or binary data would be truncated.")

            connection.close()
          )
          connection.execSqlBatch(req)
      )
      connection.execSqlBatch(req)
    )
    connection.execSqlBatch(req)

exports.transactionHelper = (test) ->
  test.expect(3)

  connection = new Connection(config)
  connection.on('end', (info) => test.done())
#  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
#  connection.on('debug', (message) => console.log(message) if (debug))

  connection.on 'connect', (err) ->
    connection.transaction (err, outerDone) ->
      test.ifError(err)

      connection.transaction (err, innerDone) ->
        test.ifError(err)

        innerDone null, outerDone, (err) ->
          test.ifError(err)
          connection.close()

exports.transactionHelperSelectiveRollback = (test) ->
  test.expect(9)

  connection = new Connection(config)
  connection.on('end', (info) => test.done())
#  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
#  connection.on('debug', (message) => console.log(message) if (debug))

  connection.on 'connect', (err) ->
    request = new Request 'create table #temp (id int)', (err) ->
      test.ifError(err)

      connection.transaction (err, outerDone) ->
        test.ifError(err)

        request = new Request 'insert into #temp (id) VALUES (1)', (err) ->
          test.ifError(err)

          connection.transaction (err, innerDone) ->
            test.ifError(err)

            request = new Request 'insert into #temp (id) VALUES (2)', (err) ->
              test.ifError(err)

              expectedError = new Error("Something failed")
              innerDone expectedError, (err) ->
                test.strictEqual(err, expectedError)

                # Do not pass the error to the outer transaction continuation
                outerDone null, (err) ->
                  test.ifError(err)

                  request = new Request 'select * from #temp', (err) ->
                    test.ifError(err)
                    connection.close()

                  request.on 'row', (row) ->
                    test.strictEqual(row[0].value, 1)

                  connection.execSql(request)

            connection.execSql(request)
        connection.execSql(request)
    connection.execSqlBatch(request)

exports.transactionHelperFullRollback = (test) ->
  test.expect(7)

  connection = new Connection(config)
  connection.on('end', (info) => test.done())
#  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
#  connection.on('debug', (message) => console.log(message) if (debug))

  connection.on 'connect', (err) ->
    request = new Request 'create table #temp (id int)', (err) ->
      test.ifError(err)

      connection.transaction (err, outerDone) ->
        test.ifError(err)

        request = new Request 'insert into #temp (id) VALUES (1)', (err) ->
          test.ifError(err)

          connection.transaction (err, innerDone) ->
            test.ifError(err)

            request = new Request 'insert into #temp (id) VALUES (2)', (err) ->
              test.ifError(err)

              expectedError = new Error("Something failed")
              innerDone expectedError, outerDone, (err) ->
                test.strictEqual(err, expectedError)

                request = new Request 'select * from #temp', (err) ->
                  test.ifError(err)
                  connection.close()

                request.on 'row', (row) ->
                  throw new Error("Did not expect any rows")

                connection.execSql(request)

            connection.execSql(request)
        connection.execSql(request)
    connection.execSqlBatch(request)

exports.transactionHelperBatchAbortingError = (test) ->
  test.expect(4)

  connection = new Connection(config)
  connection.on('end', (info) => test.done())
#  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
#  connection.on('debug', (message) => console.log(message) if (debug))

  connection.on 'connect', (err) ->
    connection.transaction (err, outerDone) ->
      test.ifError(err)

      connection.transaction (err, innerDone) ->
        test.ifError(err)

        request = new Request 'create table #temp (id int)', (err) ->
          test.ifError(err)

          request = new Request 'create table #temp (id int)', (err) ->
            innerDone err, outerDone, (err) ->
              test.equal(err.message, "There is already an object named '#temp' in the database.")

              connection.close()

          connection.execSqlBatch(request)
        connection.execSqlBatch(request)

exports.transactionHelperSocketError = (test) ->
  test.expect(3)

  connection = new Connection(config)
  connection.on('end', (info) ->
    test.done()
  )
  connection.on('error', (err) ->
    test.ok(~err.message.indexOf('socket error'))
  )
#  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
#  connection.on('debug', (message) => console.log(message) if (debug))

  connection.on 'connect', (err) ->
    connection.transaction (err, outerDone) ->
      test.ifError(err)

      connection.transaction (err, innerDone) ->
        test.ifError(err)

        request = new Request "WAITFOR 00:00:30", (err) ->
          innerDone err, outerDone, (err) ->
            test.ok(~err.message.indexOf('socket error'));

        connection.execSql(request)
        connection.socket.emit('error', new Error('socket error'))

exports.transactionHelperIsolationLevel = (test) ->
  test.expect(8)

  connection = new Connection(config)
  connection.on('end', (info) => test.done())
#  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
#  connection.on('debug', (message) => console.log(message) if (debug))


  connection.on 'connect', (err) ->
    connection.transaction((err, outerDone) ->
      test.ifError(err)

      request = new Request "SELECT [transaction_isolation_level] FROM [sys].[dm_exec_sessions] WHERE [session_id] = @@SPID", (err) ->
        test.ifError(err)

        connection.transaction((err, innerDone) ->
          test.ifError(err)

          request = new Request "SELECT [transaction_isolation_level] FROM [sys].[dm_exec_sessions] WHERE [session_id] = @@SPID", (err) ->
            test.ifError(err)

            innerDone null, outerDone, (err) ->
              request = new Request "SELECT [transaction_isolation_level] FROM [sys].[dm_exec_sessions] WHERE [session_id] = @@SPID", (err) ->
                test.ifError(err)

                connection.close()

              request.on 'row', (row) ->
                test.equal row[0].value, Transaction.ISOLATION_LEVEL.SERIALIZABLE

              connection.execSqlBatch(request)

          request.on 'row', (row) ->
            test.equal row[0].value, Transaction.ISOLATION_LEVEL.SERIALIZABLE

          connection.execSqlBatch(request)
        , Transaction.ISOLATION_LEVEL.SERIALIZABLE)

      request.on 'row', (row) ->
        test.equal row[0].value, Transaction.ISOLATION_LEVEL.REPEATABLE_READ

      connection.execSqlBatch(request)
    , Transaction.ISOLATION_LEVEL.REPEATABLE_READ)

exports.transactionHelperResetOpenTransactionCount = (test) ->
  test.expect(3)

  connection = new Connection(config)
  connection.on('end', (info) => test.done())
#  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
#  connection.on('debug', (message) => console.log(message) if (debug))

  connection.on 'connect', (err) ->
    connection.transaction (err) ->
      test.ifError(err)

      connection.reset (err) ->
        test.ifError(err)

        test.strictEqual(connection.inTransaction, false)
        connection.close()

exports.transactionHelperMixedWithLowLevelTransactionMethods = (test) ->
  test.expect(11)

  connection = new Connection(config)
  connection.on('end', (info) => test.done())
#  connection.on('errorMessage', (error) => console.log("#{error.number} : #{error.message}"))
#  connection.on('debug', (message) => console.log(message) if (debug))

  connection.on 'connect', (err) ->
    connection.beginTransaction (err) ->
      test.ifError(err)

      test.strictEqual(connection.inTransaction, true)

      connection.transaction (err, txDone) ->
        test.ifError(err)

        test.strictEqual(connection.inTransaction, true)

        connection.beginTransaction (err) ->
          test.ifError(err)

          test.strictEqual(connection.inTransaction, true)

          connection.commitTransaction (err) ->
            test.ifError(err)

            test.strictEqual(connection.inTransaction, true)

            txDone null, (err) ->
              test.strictEqual(connection.inTransaction, true)

              connection.commitTransaction (err) ->
                test.ifError err

                test.strictEqual(connection.inTransaction, false)

                connection.close()
