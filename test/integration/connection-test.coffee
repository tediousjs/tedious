async = require('async')
Connection = require('../../src/connection')
Request = require('../../src/request')
fs = require('fs')
assert = require("chai").assert
{ConnectionError} = require("../../src/errors")

describe "Connection", ->
  beforeEach ->
    @config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config

    @config.options.debug =
      packet: true
      data: true
      payload: true
      token: true
      log: true

  describe "when connecting to a non-existing server", ->
    beforeEach ->
      @config.options.connectTimeout = 200
      @config.server = "#{@config.server}-bad"

      @connection = new Connection(@config)


    it "emits a 'connect' event with a timeout error", (done) ->
      emitted = false
      @connection.on('connect', (err) ->
        emitted = true
        assert.instanceOf(err, ConnectionError)
        assert.equal(err.code, 'ETIMEOUT')
      )

      @connection.on('end', ->
        assert.isTrue(emitted)
        done()
      )

  describe "when trying to connect with an invalid port", ->
    it "throws a RangeError", ->
      @config.options.port = -1

      assert.throws =>
        new Connection(@config)
      , RangeError

  describe "when trying to connect with invalid credentials", ->
    beforeEach ->
      @config.password = "#{@config.password}-bad"
      @connection = new Connection(@config)

    it "emits a 'connect' event with an error", (done) ->
      emitted = false
      @connection.on('connect', (err) ->
        emitted = true
        assert.instanceOf(err, ConnectionError)
        assert.equal(err.code, 'ELOGIN')
      )

      @connection.on('end', ->
        assert.isTrue(emitted)
        done()
      )

    it "emits an 'errorMessage' event with error information", (done) ->
      emitted = false

      @connection.on('errorMessage', (error) =>
        emitted = true
        assert.equal(error.message, "Login failed for user '#{@config.userName}'.")
      )

      @connection.on('end', ->
        assert.isTrue(emitted)
        done()
      )

  describe "when successfully connecting", ->
    beforeEach ->
      @connection = new Connection(@config)

    it "emits a 'connected' event without an error", (done) ->
      emitted = false
      @connection.on('connect', (err) =>
        emitted = true
        assert.isUndefined(err)

        @connection.close()
      )

      @connection.on('end', ->
        assert.isTrue(emitted)
        done()
      )

    it "emits a 'databaseChange' event with the connected database name", (done) ->
      emitted = false
      @connection.on('databaseChange', (database) =>
        emitted = true
        assert.equal(database, @config.options.database)

        @connection.close()
      )

      @connection.on('end', ->
        assert.isTrue(emitted)
        done()
      )

  describe "when auto-discovering the server port using the sql server browser", ->
    beforeEach ->
      delete @config.options.port

    describe "when the instance name is valid", (done) ->
      beforeEach ->
        return if !@config.options.instanceName

        @connection = new Connection(@config)

      it "emits a 'connected' event without an error", (done) ->
        if !@config.options.instanceName
          return done()

        emitted = false
        @connection.on('connect', (err) =>
          emitted = true
          assert.isUndefined(err)

          @connection.close()
        )

        @connection.on('end', ->
          assert.isTrue(emitted)
          done()
        )

    describe "when the instance name is invalid", (done) ->
      beforeEach ->
        return if !@config.options.instanceName

        @config.options.instanceName = "#{@config.options.instanceName}-bad"
        @connection = new Connection(@config)

      it "emits a 'connected' event without an error", (done) ->
        if !@config.options.instanceName
          return done()

        emitted = false
        @connection.on('connect', (err) =>
          emitted = true
          assert.isUndefined(err)

          @connection.close()
        )

        @connection.on('end', ->
          assert.isTrue(emitted)
          done()
        )

  describe "when creating an encrypted connection", ->
    beforeEach ->
      @config.options.encrypt = true
      @connection = new Connection(@config)

    it "emits a 'connected' event without an error", (done) ->
      emitted = false
      @connection.on('connect', (err) =>
        return done(err) if err

        emitted = true
        assert.isUndefined(err)

        @connection.close()
      )

      @connection.on('end', ->
        assert.isTrue(emitted)
        done()
      )

    it "emits a 'secure' event with the CleartextStream", (done) ->
      emitted = false
      @connection.on('secure', (cleartextStream) =>
        emitted = true

        assert.ok(cleartextStream)
        assert.ok(cleartextStream.getCipher())
        assert.ok(cleartextStream.getPeerCertificate())
      )

      @connection.on('connect', => @connection.close())

      @connection.on('end', ->
        assert.isTrue(emitted)
        done()
      )

  describe "#execSql", ->
    beforeEach (done) ->
      @connection = new Connection(@config)
      @connection.on 'connect', done

    afterEach ->
      @connection.close if @connection

    it "executes the given Request", (done) ->
      request = new Request('select 8 as C1', (err, rowCount) =>
        assert.equal(err, null)
        assert.strictEqual(rowCount, 1)

        done()
      )

      request.on('doneInProc', (rowCount, more) ->
        assert.ok(more)
        assert.strictEqual(rowCount, 1)
      )

      request.on('columnMetadata', (columnsMetadata) ->
        assert.strictEqual(columnsMetadata.length, 1)
      )

      request.on('row', (columns) ->
        assert.strictEqual(columns.length, 1)
        assert.strictEqual(columns[0].value, 8)
      )

      @connection.execSql(request)

    it "can be executed multiple times", (done) ->
      timesToExec = 5
      sqlExecCount = 0

      execSql = =>
        if sqlExecCount == timesToExec
          return done()

        request = new Request('select 8 as C1', (err, rowCount) ->
            assert.ok(!err)
            assert.strictEqual(rowCount, 1)

            sqlExecCount++
            execSql()
        )

        request.on('doneInProc', (rowCount, more) ->
            assert.ok(more)
            assert.strictEqual(rowCount, 1)
        )

        request.on('columnMetadata', (columnsMetadata) ->
            assert.strictEqual(columnsMetadata.length, 1)
        )

        request.on('row', (columns) ->
            assert.strictEqual(columns.length, 1)
            assert.strictEqual(columns[0].value, 8)
        )

        @connection.execSql(request)

      execSql()

    it "calls back with an error on bad sql syntax", (done) ->
      request = new Request('bad syntax here', (err) =>
        assert.ok(err)

        done()
      )

      @connection.execSql(request)

    it "yields rows in the order as specified by the executed query", (done) ->
      sql = "select top 2 object_id, name, column_id, system_type_id from sys.columns order by name, system_type_id"
      request = new Request(sql, (err, rowCount) ->
        return done(err) if err

        assert.ok(!err)
        assert.strictEqual(rowCount, 2)

        done()
      )

      request.on('doneInProc', (rowCount, more) ->
        assert.ok(more)
        assert.strictEqual(rowCount, 2)
      )

      request.on('columnMetadata', (columnsMetadata) ->
        assert.strictEqual(columnsMetadata.length, 4)
      )

      request.on('order', (orderColumns) ->
        assert.strictEqual(orderColumns.length, 2)
        assert.strictEqual(orderColumns[0], 2)
        assert.strictEqual(orderColumns[1], 4)
      )

      request.on('row', (columns) ->
        assert.strictEqual(columns.length, 4)
      )

      @connection.execSql(request)

    it "can handle multiple sql statements in a single request", (done) ->
      row = 0
      request = new Request('select 1; select 2;', (err, rowCount) ->
        return done(err) if err

        assert.ok(!err)
        assert.strictEqual(rowCount, 2)
        assert.strictEqual(row, 2)

        done()
      )

      request.on('doneInProc', (rowCount, more) ->
        assert.strictEqual(rowCount, 1)
      )

      request.on('columnMetadata', (columnsMetadata) ->
        assert.strictEqual(columnsMetadata.length, 1)
      )

      request.on('row', (columns) ->
        assert.strictEqual(columns[0].value, ++row)
      )

      @connection.execSql(request)


    it "returns the correct row count queries containing multiple mixed statemtns", (done) ->
      setupSql = """
        create table #tab1 (id int, name nvarchar(10));
        insert into #tab1 values(1, N'a1');
        insert into #tab1 values(2, N'a2');
        insert into #tab1 values(3, N'b1');
        update #tab1 set name = 'a3' where name like 'a%'
      """

      request = new Request(setupSql, (err, rowCount) ->
        return done(err) if err

        assert.strictEqual(rowCount, 5)

        done()
      )

      @connection.execSql(request)

    it "can execute procs in the sql statement", (done) ->
      request = new Request('exec sp_help int', (err, rowCount) ->
        return done(err) if err

        assert.strictEqual(rowCount, 0)

        done()
      )

      request.on('doneProc', (rowCount, more, returnStatus) ->
        assert.ok(!more)
        assert.strictEqual(returnStatus, 0)
      )

      request.on('doneInProc', (rowCount, more) ->
        assert.ok(more)
      )

      request.on('row', (columns) ->
        assert.ok(true)
      )

      @connection.execSql(request)

  describe "#execSql, with the useColumnNames option", ->
    beforeEach (done) ->
      @config.options.useColumnNames = true
      @connection = new Connection(@config)
      @connection.on 'connect', done

    afterEach ->
      @connection.close if @connection

    it "can handle numeric column names", (done) ->
      request = new Request('select 8 as [123]', (err, rowCount) =>
        return done(err) if err

        assert.equal(err, null)
        assert.strictEqual(rowCount, 1)

        done()
      )

      request.on('doneInProc', (rowCount, more) ->
        assert.ok(more)
        assert.strictEqual(rowCount, 1)
      )

      request.on('columnMetadata', (columnsMetadata) ->
        assert.strictEqual(Object.keys(columnsMetadata).length, 1)
      )

      request.on('row', (columns) ->
        assert.strictEqual(Object.keys(columns).length, 1)

        assert.strictEqual(columns[123].value, 8)
      )

      @connection.execSql(request)

    it "can handle duplicate column names", (done) ->
      request = new Request('select 1 as abc, 2 as xyz, \'3\' as abc', (err, rowCount) =>
        assert.equal(err, null)
        assert.strictEqual(rowCount, 1)

        done()
      )

      request.on('doneInProc', (rowCount, more) ->
        assert.ok(more)
        assert.strictEqual(rowCount, 1)
      )

      request.on('columnMetadata', (columnsMetadata) ->
        assert.strictEqual(Object.keys(columnsMetadata).length, 2)
      )

      request.on('row', (columns) ->
        assert.strictEqual(Object.keys(columns).length, 2)

        assert.strictEqual(columns.abc.value, 1)
        assert.strictEqual(columns.xyz.value, 2)
      )

      @connection.execSql(request)

  describe "#execSql, with the rowCollectionOnRequestCompletion option", ->
    beforeEach (done) ->
      @config.options.rowCollectionOnRequestCompletion = true
      @connection = new Connection(@config)
      @connection.on 'connect', done

    afterEach ->
      @connection.close if @connection

    it "passes a collection of all returned rows to the request callback", (done) ->
      request = new Request('select 1 as a; select 2 as b;', (err, rowCount, rows) ->
        assert.strictEqual(rows.length, 2)

        assert.strictEqual(rows[0][0].metadata.colName, 'a')
        assert.strictEqual(rows[0][0].value, 1)
        assert.strictEqual(rows[1][0].metadata.colName, 'b')
        assert.strictEqual(rows[1][0].value, 2)

        done()
      )

      @connection.execSql(request)

  describe "#execSql, with the rowCollectionOnDone option", ->
    beforeEach (done) ->
      @config.options.rowCollectionOnDone = true
      @connection = new Connection(@config)
      @connection.on 'connect', done

    afterEach ->
      @connection.close if @connection

    it "passes a collection of all returned rows to each statements 'done' callback", (done) ->
      doneCount = 0

      request = new Request('select 1 as a; select 2 as b;', done)

      request.on('doneInProc', (rowCount, more, rows) ->
        assert.strictEqual(rows.length, 1)

        switch ++doneCount
          when 1
            assert.strictEqual(rows[0][0].metadata.colName, 'a')
            assert.strictEqual(rows[0][0].value, 1)
          when 2
            assert.strictEqual(rows[0][0].metadata.colName, 'b')
            assert.strictEqual(rows[0][0].value, 2)
      )

      @connection.execSql(request)

  describe "#cancel", ->
    beforeEach (done) ->
      @connection = new Connection(@config)
      @connection.on 'connect', done

    afterEach ->
      @connection.close if @connection

    it "aborts the currently running request", (done) ->
      request = new Request('select 1 as C1;waitfor delay \'00:00:05\';select 2 as C2', (err, rowCount, rows) ->
        assert.strictEqual err.message, 'Canceled.'

        done()
      )

      request.on('doneInProc', (rowCount, more) ->
        assert.ok false
      )

      request.on('doneProc', (rowCount, more) ->
        assert.ok !rowCount
        assert.strictEqual more, false
      )

      request.on('done', (rowCount, more, rows) ->
        assert.ok !rowCount
        assert.strictEqual more, false
      )

      request.on('columnMetadata', (columnsMetadata) ->
        assert.strictEqual(columnsMetadata.length, 1)
      )

      request.on('row', (columns) ->
        assert.strictEqual(columns.length, 1)
        assert.strictEqual(columns[0].value, 1)
      )

      @connection.execSql(request)
      @connection.cancel()

exports.connectByInstanceName = (test) ->
  if !getInstanceName()
    # Config says don't do this test (probably because SQL Server Browser is not available).
    console.log('Skipping connectByInstanceName test')
    test.done()
    return

  test.expect(2)

  config = getConfig()
  delete config.options.port
  config.options.instanceName = getInstanceName()

  connection = new Connection(config)

  connection.on('connect', (err) ->
    test.ok(!err)

    connection.close()
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('databaseChange', (database) ->
    test.strictEqual(database, config.options.database)
  )

  connection.on('infoMessage', (info) ->
    #console.log("#{info.number} : #{info.message}")
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )

exports.connectByInvalidInstanceName = (test) ->
  if !getInstanceName()
    # Config says don't do this test (probably because SQL Server Browser is not available).
    console.log('Skipping connectByInvalidInstanceName test')
    test.done()
    return

  test.expect(1)

  config = getConfig()
  delete config.options.port
  config.options.instanceName = "#{getInstanceName()}X"

  connection = new Connection(config)

  connection.on('connect', (err) ->
    test.ok(err)

    connection.close()
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('infoMessage', (info) ->
    #console.log("#{info.number} : #{info.message}")
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )

exports.resetConnection = (test) ->
  test.expect(4)

  config = getConfig()

  testAnsiNullsOptionOn = (callback) ->
    testAnsiNullsOption(true, callback)

  testAnsiNullsOptionOff = (callback) ->
    testAnsiNullsOption(false, callback)

  testAnsiNullsOption = (expectedOptionOn, callback) ->
    request = new Request('select @@options & 32', (err, rowCount) ->
      callback(err)
    )

    request.on('row', (columns) ->
      optionOn = columns[0].value == 32
      test.strictEqual(optionOn, expectedOptionOn)
    )

    connection.execSql(request)

  setAnsiNullsOptionOff = (callback) ->
    request = new Request('set ansi_nulls off', (err, rowCount) ->
      callback(err)
    )

    connection.execSqlBatch(request)

  connection = new Connection(config)

  connection.on('resetConnection', ->
    test.ok(true)
  )

  connection.on('connect', (err) ->
    async.series([
      testAnsiNullsOptionOn,
      setAnsiNullsOptionOff,
      testAnsiNullsOptionOff,
      (callback) ->
        connection.reset (err) ->
          if connection.config.options.tdsVersion < '7_2'
            # TDS 7_1 doesnt send RESETCONNECTION acknowledgement packet
            test.ok(true)
           
          callback err
      testAnsiNullsOptionOn,
      (callback) ->
        connection.close()
        callback()
    ])
  )

  connection.on('end', (info) ->
    test.done()
  )

  connection.on('infoMessage', (info) ->
    #console.log("#{info.number} : #{info.message}")
  )

  connection.on('debug', (text) ->
    #console.log(text)
  )
