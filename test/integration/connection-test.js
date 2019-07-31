const async = require('async');
const Connection = require('../../src/connection');
const Request = require('../../src/request');
const fs = require('fs');
const homedir = require('os').homedir();
const assert = require('chai').assert;

function getConfig() {
  const config = JSON.parse(
    fs.readFileSync(homedir + '/.tedious/test-connection.json', 'utf8')
  ).config;

  config.options.debug = {
    packet: true,
    data: true,
    payload: true,
    token: true,
    log: true,
  };

  config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;

  return config;
}

process.on('uncaughtException', function (err) {
  console.error(err.stack);
});

function getInstanceName() {
  return JSON.parse(
    fs.readFileSync(homedir + '/.tedious/test-connection.json', 'utf8')
  ).instanceName;
}

function getNtlmConfig() {
  return JSON.parse(
    fs.readFileSync(homedir + '/.tedious/test-connection.json', 'utf8')
  ).ntlm;
}

describe('Initiate Connect Test', function() {
  this.timeout(20000);

  it('should be bad server', function(done) {
    let config = getConfig();
    config.server = 'bad-server';

    let connection = new Connection(config);

    connection.on('connect', function (err) {
      assert.ok(err);
    });

    connection.on('end', function (info) {
      done();
    });

    return connection.on('debug', function (text) {
      // console.log(text)
    });
  })

  it('should be bad port', (done) => {
    let config = getConfig();
    config.options.port = -1;
    config.options.connectTimeout = 200;

    assert.throws(function () {
      new Connection(config);
    });

    done();
  })

  it('should be bad credentials', (done) => {
    let config = getConfig();

    config.authentication.options.userName = 'bad-user';
    config.authentication.options.password = 'bad-password';

    let connection = new Connection(config);

    connection.on('connect', function (err) {
      assert.ok(err);

      connection.close();
    });

    connection.on('end', function (info) {
      done();
    });

    connection.on('infoMessage', function (info) {
      // console.log("#{info.number} : #{info.message}")
    });

    connection.on('errorMessage', function (error) {
      // console.log(`${error.number} : ${error.message}`)
      return assert.ok(~error.message.indexOf('failed') || ~error.message.indexOf('登录失败'));
    });

    return connection.on(
      'debug',
      function (text) { }
      // console.log(text)
    );
  })

  it('should connect by port', (done) => {
    let config = getConfig();

    if ((config.options != null ? config.options.port : undefined) == null) {
      // Config says don't do this test (probably because ports are dynamic).
      console.log('Skipping connectByPort test');
      done();
      return;
    }

    let connection = new Connection(config);

    connection.on('connect', function (err) {
      assert.ifError(err);

      connection.close();
    });

    connection.on('end', function (info) {
      done();
    });

    connection.on('databaseChange', function (database) {
      assert.strictEqual(database, config.options.database);
    });

    connection.on('infoMessage', function (info) {
      // console.log("#{info.number} : #{info.message}")
    });

    return connection.on('debug', function (text) {
      // console.log(text)
    });
  })

  it('should connect by instance name', (done) => {
    if (!getInstanceName()) {
      // Config says don't do this test (probably because SQL Server Browser is not available).
      console.log('Skipping connectByInstanceName test');
      done();
      return;
    }

    let config = getConfig();
    delete config.options.port;
    config.options.instanceName = getInstanceName();

    let connection = new Connection(config);

    connection.on('connect', function (err) {
      assert.ifError(err);

      connection.close();
    });

    connection.on('end', function (info) {
      done();
    });

    connection.on('databaseChange', function (database) {
      assert.strictEqual(database, config.options.database);
    });

    connection.on('infoMessage', function (info) {
      // console.log("#{info.number} : #{info.message}")
    });

    return connection.on('debug', function (text) {
      // console.log(text)
    });
  })

  it('should connect by invalid instance name', (done) => {
    if (!getInstanceName()) {
      // Config says don't do this test (probably because SQL Server Browser is not available).
      console.log('Skipping connectByInvalidInstanceName test');
      done();
      return;
    }

    let config = getConfig();
    delete config.options.port;
    config.options.instanceName = `${getInstanceName()}X`;

    let connection = new Connection(config);

    connection.on('connect', function (err) {
      assert.ok(err);

      connection.close();
    });

    connection.on('end', function (info) {
      done();
    });

    connection.on('infoMessage', function (info) {
      // console.log("#{info.number} : #{info.message}")
    });

    return connection.on('debug', function (text) {
      // console.log(text)
    });
  })

  it('should potentially throw an error on invalid crypto credential details', (done) => {
    let config = getConfig();
    config.options.encrypt = true;

    // On newer Node.js versions, this will throw an error when passed to `tls.createSecureContext`
    config.options.cryptoCredentialsDetails = {
      ciphers: '!ALL'
    };

    try {
      const { createSecureContext } = require('tls');
      createSecureContext(config.options.cryptoCredentialsDetails);
    } catch {
      assert.throws(() => {
        new Connection(config);
      });
    }

    done();
  })

  it('should fail if no cipher can be negotiated', (done) => {
    let config = getConfig();
    config.options.encrypt = true;

    // Specify a cipher that should never be supported by SQL Server
    config.options.cryptoCredentialsDetails = {
      ciphers: 'NULL'
    };

    let connection = new Connection(config);
    connection.on('connect', function (err) {
      assert.ok(err);
      assert.strictEqual(err.code, 'ESOCKET');
    });

    connection.on('end', function () {
      done();
    });
  })

  it('should not emit error after connect timeout', function (done) {
    const config = getConfig();
    config.options.connectTimeout = 1;

    const connection = new Connection(config);
    connection.on('error', (error) => { assert.ifError(error); });
    connection.on('connect', (err) => { });

    setTimeout(() => { done(); }, 500);
  })

})


describe('Ntlm Test', () => {
  let DomainCaseEnum = {
    AsIs: 0,
    Lower: 1,
    Upper: 2,
  };

  function runNtlmTest(done, domainCase) {
    let ntlmConfig = getNtlmConfig();
    if (!ntlmConfig) {
      console.log('Skipping ntlm test');
      done();
      return;
    }

    switch (domainCase) {
      case DomainCaseEnum.AsIs:
        break;
      case DomainCaseEnum.Lower:
        ntlmConfig.authentication.options.domain = ntlmConfig.authentication.options.domain.toLowerCase();
        break;
      case DomainCaseEnum.Upper:
        ntlmConfig.authentication.options.domain = ntlmConfig.authentication.options.domain.toUpperCase();
        break;
      default:
        assert.ok(false, 'Unexpected value for domainCase: ' + domainCase);
    }

    let connection = new Connection(ntlmConfig);

    connection.on('connect', function (err) {
      assert.ifError(err);

      connection.close();
    });

    connection.on('end', function (info) {
      done();
    });

    connection.on('infoMessage', function (info) {
      // console.log("#{info.number} : #{info.message}")
    });

    return connection.on('debug', function (text) {
      // console.log(text)
    });
  }

  it('should ntlm', (done) => {
    runNtlmTest(done, DomainCaseEnum.AsIs);
  })

  it('should ntlm lower', (done) => {
    runNtlmTest(done, DomainCaseEnum.Lower);
  })

  it('should ntlm upper', (done) => {
    runNtlmTest(done, DomainCaseEnum.Upper);
  })
})

describe('Encrypt Test', () => {
  it('should encrypt', (done) => {
    let config = getConfig();
    config.options.encrypt = true;

    let connection = new Connection(config);

    connection.on('connect', function (err) {
      assert.ifError(err);

      connection.close();
    });

    connection.on('end', function (info) {
      done();
    });

    connection.on('databaseChange', function (database) {
      assert.strictEqual(database, config.options.database);
    });

    connection.on('secure', function (cleartext) {
      assert.ok(cleartext);
      assert.ok(cleartext.getCipher());
      assert.ok(cleartext.getPeerCertificate());
    });

    connection.on('infoMessage', function (info) {
      // console.log("#{info.number} : #{info.message}")
    });

    return connection.on('debug', function (text) {
      // console.log(text)
    });
  })
})

describe('Insertion Tests', function() {
  this.timeout(30000)

  it('should execSql', (done) => {
    let config = getConfig();

    let request = new Request('select 8 as C1', function (err, rowCount) {
      assert.ifError(err);
      assert.strictEqual(rowCount, 1);

      connection.close();
    });

    request.on('doneInProc', function (rowCount, more) {
      assert.ok(more);
      assert.strictEqual(rowCount, 1);
    });

    request.on('columnMetadata', function (columnsMetadata) {
      assert.strictEqual(columnsMetadata.length, 1);
    });

    request.on('row', function (columns) {
      assert.strictEqual(columns.length, 1);
      assert.strictEqual(columns[0].value, 8);
    });

    let connection = new Connection(config);

    connection.on('connect', function (err) {
      connection.execSql(request);
    });

    connection.on('end', function (info) {
      done();
    });

    connection.on('infoMessage', function (info) {
      // console.log("#{info.number} : #{info.message}")
    });

    return connection.on('debug', function (text) {
      // console.log(text)
    });
  })

  it('should numeric column name', (done) => {
    let config = getConfig();
    config.options.useColumnNames = true;

    let request = new Request('select 8 as [123]', function (err, rowCount) {
      assert.ifError(err);
      assert.strictEqual(rowCount, 1);

      connection.close();
    });

    request.on('columnMetadata', function (columnsMetadata) {
      assert.strictEqual(Object.keys(columnsMetadata).length, 1);
    });

    request.on('row', function (columns) {
      assert.strictEqual(Object.keys(columns).length, 1);
      assert.strictEqual(columns[123].value, 8);
    });

    let connection = new Connection(config);

    connection.on('connect', function (err) {
      connection.execSql(request);
    });

    connection.on('end', function (info) {
      done();
    });

    connection.on('infoMessage', function (info) {
      // console.log("#{info.number} : #{info.message}")
    });

    connection.on('debug', function (text) {
      // console.log(text)
    });
  })

  it('should duplicate column name', (done) => {
    let config = getConfig();
    config.options.useColumnNames = true;

    let request = new Request("select 1 as abc, 2 as xyz, '3' as abc", function (
      err,
      rowCount
    ) {
      assert.ifError(err);
      assert.strictEqual(rowCount, 1);

      connection.close();
    });

    request.on('columnMetadata', function (columnsMetadata) {
      assert.strictEqual(Object.keys(columnsMetadata).length, 2);
    });

    request.on('row', function (columns) {
      assert.strictEqual(Object.keys(columns).length, 2);

      assert.strictEqual(columns.abc.value, 1);
      assert.strictEqual(columns.xyz.value, 2);
    });

    let connection = new Connection(config);

    connection.on('connect', function (err) {
      connection.execSql(request);
    });

    connection.on('end', function (info) {
      done();
    });

    connection.on('infoMessage', function (info) {
      // console.log("#{info.number} : #{info.message}")
    });

    connection.on('debug', function (text) {
      // console.log(text)
    });
  })

  it('should exec Sql multiple times', (done) => {
    let timesToExec = 5;
    let sqlExecCount = 0;
    let config = getConfig();

    function execSql() {
      if (sqlExecCount === timesToExec) {
        connection.close();
        return;
      }

      let request = new Request('select 8 as C1', function (err, rowCount) {
        assert.ifError(err);
        assert.strictEqual(rowCount, 1);

        sqlExecCount++;
        execSql();
      });

      request.on('doneInProc', function (rowCount, more) {
        assert.ok(more);
        assert.strictEqual(rowCount, 1);
      });

      request.on('columnMetadata', function (columnsMetadata) {
        assert.strictEqual(columnsMetadata.length, 1);
      });

      request.on('row', function (columns) {
        assert.strictEqual(columns.length, 1);
        assert.strictEqual(columns[0].value, 8);
      });

      connection.execSql(request);
    }

    let connection = new Connection(config);

    connection.on('connect', function (err) {
      execSql();
    });

    connection.on('end', function (info) {
      done();
    });

    connection.on('infoMessage', function (info) {
      // console.log("#{info.number} : #{info.message}")
    });

    connection.on('debug', function (text) {
      // console.log(text)
    });
  })

  it('should exec sql with order', (done) => {
    let config = getConfig();

    let sql =
      'select top 2 object_id, name, column_id, system_type_id from sys.columns order by name, system_type_id';
    let request = new Request(sql, function (err, rowCount) {
      assert.ifError(err);
      assert.strictEqual(rowCount, 2);

      connection.close();
    });

    request.on('doneInProc', function (rowCount, more) {
      assert.ok(more);
      assert.strictEqual(rowCount, 2);
    });

    request.on('columnMetadata', function (columnsMetadata) {
      assert.strictEqual(columnsMetadata.length, 4);
    });

    request.on('order', function (orderColumns) {
      assert.strictEqual(orderColumns.length, 2);
      assert.strictEqual(orderColumns[0], 2);
      assert.strictEqual(orderColumns[1], 4);
    });

    request.on('row', function (columns) {
      assert.strictEqual(columns.length, 4);
    });

    let connection = new Connection(config);

    connection.on('connect', function (err) {
      connection.execSql(request);
    });

    connection.on('end', function (info) {
      done();
    });

    connection.on('infoMessage', function (info) {
      // console.log("#{info.number} : #{info.message}")
    });

    connection.on('errorMessage', function (error) {
      // console.log("#{error.number} : #{error.message}")
    });

    connection.on('debug', function (text) {
      // console.log(text)
    });
  })

  it('should exec Bad Sql', (done) => {
    let config = getConfig();

    let request = new Request('bad syntax here', function (err) {
      assert.ok(err);

      connection.close();
    });

    let connection = new Connection(config);

    connection.on('connect', function (err) {
      connection.execSql(request);
    });

    connection.on('end', function (info) {
      done();
    });

    connection.on('errorMessage', function (error) {
      // console.log("#{error.number} : #{error.message}")
      assert.ok(error);
    });

    connection.on('debug', function (text) {
      // console.log(text)
    });
  })

  it('should close connection request pending', (done) => {
    let config = getConfig();

    let request = new Request('select 8 as C1', function (err, rowCount) {
      assert.ok(err);
      assert.strictEqual(err.code, 'ECLOSE');
    });

    let connection = new Connection(config);

    connection.on('connect', function (err) {
      assert.ifError(err);
      connection.execSql(request);

      // This should trigger request callback with error as there is
      // request pending now.
      connection.close();
    });

    connection.on('end', function (info) {
      done();
    });

    connection.on('error', function (err) {
    });

    connection.on('infoMessage', function (info) {
      // console.log("#{info.number} : #{info.message}")
    });

    connection.on('debug', function (text) {
      // console.log(text)
    });
  })

  it('should sql with multiple result sets', (done) => {
    let config = getConfig();
    let row = 0;

    let request = new Request('select 1; select 2;', function (err, rowCount) {
      assert.ifError(err);
      assert.strictEqual(rowCount, 2);

      connection.close();
    });

    request.on('doneInProc', function (rowCount, more) {
      assert.strictEqual(rowCount, 1);
    });

    request.on('columnMetadata', function (columnsMetadata) {
      assert.strictEqual(columnsMetadata.length, 1);
    });

    request.on('row', function (columns) {
      assert.strictEqual(columns[0].value, ++row);
    });

    let connection = new Connection(config);

    connection.on('connect', function (err) {
      connection.execSql(request);
    });

    connection.on('end', function (info) {
      done();
    });

    connection.on('infoMessage', function (info) {
      // console.log("#{info.number} : #{info.message}")
    });

    connection.on('debug', function (text) {
      // console.log(text)
    });
  })

  it('should row count for update', (done) => {
    let config = getConfig();

    let setupSql = `\
  create table #tab1 (id int, name nvarchar(10));
  insert into #tab1 values(1, N'a1');
  insert into #tab1 values(2, N'a2');
  insert into #tab1 values(3, N'b1');
  update #tab1 set name = 'a3' where name like 'a%'\
  `;

    let request = new Request(setupSql, function (err, rowCount) {
      assert.ifError(err);
      assert.strictEqual(rowCount, 5);
      connection.close();
    });

    let connection = new Connection(config);

    connection.on('connect', function (err) {
      connection.execSql(request);
    });

    connection.on('end', function (info) {
      done();
    });

    connection.on('infoMessage', function (info) {
      // console.log("#{info.number} : #{info.message}")
    });

    connection.on('debug', function (text) {
      // console.log(text)
    });
  })

  it('should row collection on request completion', (done) => {
    let config = getConfig();
    config.options.rowCollectionOnRequestCompletion = true;

    let request = new Request('select 1 as a; select 2 as b;', function (
      err,
      rowCount,
      rows
    ) {
      assert.strictEqual(rows.length, 2);

      assert.strictEqual(rows[0][0].metadata.colName, 'a');
      assert.strictEqual(rows[0][0].value, 1);
      assert.strictEqual(rows[1][0].metadata.colName, 'b');
      assert.strictEqual(rows[1][0].value, 2);

      connection.close();
    });

    let connection = new Connection(config);

    connection.on('connect', function (err) {
      connection.execSql(request);
    });

    connection.on('end', function (info) {
      done();
    });

    connection.on('infoMessage', function (info) {
      // console.log("#{info.number} : #{info.message}")
    });

    connection.on('debug', function (text) {
      // console.log(text)
    });
  })

  it('should row collection on Done', (done) => {
    let config = getConfig();
    config.options.rowCollectionOnDone = true;

    let doneCount = 0;

    let request = new Request('select 1 as a; select 2 as b;', function (
      err,
      rowCount,
      rows
    ) {
      connection.close();
    });

    request.on('doneInProc', function (rowCount, more, rows) {
      assert.strictEqual(rows.length, 1);

      switch (++doneCount) {
        case 1:
          assert.strictEqual(rows[0][0].metadata.colName, 'a');
          assert.strictEqual(rows[0][0].value, 1);
          break;
        case 2:
          assert.strictEqual(rows[0][0].metadata.colName, 'b');
          assert.strictEqual(rows[0][0].value, 2);
          break;
      }
    });

    let connection = new Connection(config);

    connection.on('connect', function (err) {
      connection.execSql(request);
    });

    connection.on('end', function (info) {
      done();
    });

    connection.on('infoMessage', function (info) {
      // console.log("#{info.number} : #{info.message}")
    });

    connection.on('debug', function (text) {
      // console.log(text)
    });
  })

  it('should exec proc as sql', (done) => {
    let config = getConfig();

    let request = new Request('exec sp_help int', function (err, rowCount) {
      assert.ifError(err);
      assert.strictEqual(rowCount, 0);

      connection.close();
    });

    request.on('doneProc', function (rowCount, more, returnStatus) {
      assert.ok(!more);
      assert.strictEqual(returnStatus, 0);
    });

    request.on('doneInProc', function (rowCount, more) {
      assert.ok(more);
    });

    request.on('row', function (columns) {
      assert.ok(true);
    });

    let connection = new Connection(config);

    connection.on('connect', function (err) {
      connection.execSql(request);
    });

    connection.on('end', function (info) {
      done();
    });

    connection.on('infoMessage', function (info) {
      // console.log("#{info.number} : #{info.message}")
    });

    connection.on('debug', function (text) {
      // console.log(text)
    });
  })

  it('should reset Connection', (done) => {
    let config = getConfig();

    function testAnsiNullsOptionOn(callback) {
      testAnsiNullsOption(true, callback);
    }

    function testAnsiNullsOptionOff(callback) {
      testAnsiNullsOption(false, callback);
    }

    function testAnsiNullsOption(expectedOptionOn, callback) {
      let request = new Request('select @@options & 32', function (err, rowCount) {
        callback(err);
      });

      request.on('row', function (columns) {
        let optionOn = columns[0].value === 32;
        assert.strictEqual(optionOn, expectedOptionOn);
      });

      connection.execSql(request);
    }

    function setAnsiNullsOptionOff(callback) {
      let request = new Request('set ansi_nulls off', function (err, rowCount) {
        callback(err);
      });

      connection.execSqlBatch(request);
    }

    let connection = new Connection(config);

    connection.on('resetConnection', function () {
      assert.ok(true);
    });

    connection.on('connect', function (err) {
      async.series([
        testAnsiNullsOptionOn,
        setAnsiNullsOptionOff,
        testAnsiNullsOptionOff,
        function (callback) {
          connection.reset(function (err) {
            if (connection.config.options.tdsVersion < '7_2') {
              // TDS 7_1 doesnt send RESETCONNECTION acknowledgement packet
              assert.ok(true);
            }

            callback(err);
          });
        },
        testAnsiNullsOptionOn,
        function (callback) {
          connection.close();
          callback();
        },
      ]);
    });

    connection.on('end', function (info) {
      done();
    });

    connection.on('infoMessage', function (info) {
      // console.log("#{info.number} : #{info.message}")
    });

    connection.on('debug', function (text) {
      // console.log(text)
    });
  })

  it('should cancel request', (done) => {
    let config = getConfig();

    let request = new Request(
      "select 1 as C1;waitfor delay '00:00:05';select 2 as C2",
      function (err, rowCount, rows) {
        assert.strictEqual(err.message, 'Canceled.');

        connection.close();
      }
    );

    request.on('doneInProc', function (rowCount, more) {
      assert.ok(false);
    });

    request.on('doneProc', function (rowCount, more) {
      assert.ok(false);
    });

    request.on('done', function (rowCount, more, rows) {
      assert.ok(false);
    });

    request.on('columnMetadata', function (columnsMetadata) {
      assert.ok(false);
    });

    request.on('row', function (columns) {
      assert.ok(false);
    });

    let connection = new Connection(config);

    connection.on('connect', function (err) {
      connection.execSql(request);
      setTimeout(connection.cancel.bind(connection), 2000);
    });

    connection.on('end', function (info) {
      done();
    });

    connection.on('infoMessage', function (info) {
      // console.log("#{info.number} : #{info.message}")
    });

    connection.on('debug', function (text) {
      // console.log(text)
    });
  })

  it('should request timeout', (done) => {
    let config = getConfig();
    config.options.requestTimeout = 1000;

    let request = new Request(
      "select 1 as C1;waitfor delay '00:00:05';select 2 as C2",
      function (err, rowCount, rows) {
        assert.equal(err.message, 'Timeout: Request failed to complete in 1000ms');

        connection.close();
      }
    );

    request.on('doneInProc', function (rowCount, more) {
      assert.ok(false);
    });

    request.on('doneProc', function (rowCount, more) {
      assert.ok(false);
    });

    request.on('done', function (rowCount, more, rows) {
      assert.ok(false);
    });

    request.on('columnMetadata', function (columnsMetadata) {
      assert.ok(false);
    });

    request.on('row', function (columns) {
      assert.ok(false);
    });

    let connection = new Connection(config);

    connection.on('connect', function (err) {
      connection.execSql(request);
    });

    connection.on('end', function (info) {
      done();
    });

    connection.on('infoMessage', function (info) {
      // console.log("#{info.number} : #{info.message}")
    });

    connection.on('debug', function (text) {
      // console.log(text)
    });
  })
})

describe('Advanced Input Test', () => {
  function runSqlBatch(done, config, sql, requestCallback) {
    let connection = new Connection(config);

    let request = new Request(sql, function () {
      requestCallback.apply(this, arguments);
      connection.close();
    });

    connection.on('connect', function (err) {
      assert.ifError(err);
      connection.execSqlBatch(request);
    });

    connection.on('end', function (info) {
      done();
    });
  }

  // Test that the default behavior allows adding null values to a
  // temporary table where the nullability is not explicitly declared.
  it('should test AnsiNullDefault', (done) => {
    let sql =
      'create table #testAnsiNullDefault (id int);\n' +
      'insert #testAnsiNullDefault values (null);\n' +
      'drop table #testAnsiNullDefault;';

    runSqlBatch(done, getConfig(), sql, function (err) {
      assert.ifError(err);
    });
  })

  // Test that the default behavior can be overridden (so that temporary
  // table columns are non-nullable by default).
  it('should disable ansi null default', (done) => {
    let sql =
      'create table #testAnsiNullDefaults (id int);\n' +
      'insert #testAnsiNullDefaults values (null);\n' +
      'drop table #testAnsiNullDefaults;';

    let config = getConfig();
    config.options.enableAnsiNullDefault = false;

    runSqlBatch(done, config, sql, function (err) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err != null ? err.number : undefined, 515);
    }); // Cannot insert the value NULL
  })
})

describe('Date Insert Test', () => {
  let testDateFirstImpl = (done, datefirst) => {
    datefirst = datefirst || 7;
    let config = getConfig();
    config.options.datefirst = datefirst;

    let connection = new Connection(config);

    let request = new Request('select @@datefirst', function (err) {
      assert.ifError(err);
      connection.close();
    });

    request.on('row', function (columns) {
      let dateFirstActual = columns[0].value;
      assert.strictEqual(dateFirstActual, datefirst);
    });

    connection.on('connect', function (err) {
      assert.ifError(err);
      connection.execSql(request);
    });

    connection.on('end', function (info) {
      done();
    });
  };

  // Test that the default setting for DATEFIRST is 7
  it('should test date first default', (done) => {
    testDateFirstImpl(done, undefined);
  })

  // Test that the DATEFIRST setting can be changed via an optional configuration
  it('should test date first custom', (done) => {
    testDateFirstImpl(done, 3);
  })

  // Test that an invalid DATEFIRST setting throws
  it('should test bad date first', (done) => {
    let config = getConfig();
    config.options.datefirst = -1;

    assert.throws(function () {
      new Connection(config);
    });

    done();
  })
})

describe('Language Insert Test', () => {
  function testLanguage(done, language) {
    language = language || 'us_english';
    let config = getConfig();
    config.options.language = language;

    let connection = new Connection(config);

    let request = new Request('select @@language', function (err) {
      assert.ifError(err);
      connection.close();
    });

    request.on('row', function (columns) {
      let languageActual = columns[0].value;
      assert.strictEqual(languageActual, language);
    });

    connection.on('connect', function (err) {
      assert.ifError(err);
      connection.execSql(request);
    });

    connection.on('end', function (info) {
      done();
    });
  }
  // Test that the default setting for LANGUAGE is us_english
  it('should test language default', (done) => {
    testLanguage(done, undefined);
  })

  // Test that the LANGUAGE setting can be changed via an optional configuration
  it('should test language custom', (done) => {
    testLanguage(done, 'Deutsch');
  })
})

describe('should test date format', () => {
  function testDateFormat(done, dateFormat) {
    dateFormat = dateFormat || 'mdy';
    let config = getConfig();
    config.options.dateFormat = dateFormat;

    let connection = new Connection(config);

    let request = new Request(
      'SELECT DATE_FORMAT FROM sys.dm_exec_sessions WHERE SESSION_ID = @@SPID ',
      function (err) {
        assert.ifError(err);
        connection.close();
      }
    );

    request.on('row', function (columns) {
      let dateFormatActual = columns[0].value;
      assert.strictEqual(dateFormatActual, dateFormat);
    });

    connection.on('connect', function (err) {
      assert.ifError(err);
      connection.execSql(request);
    });

    connection.on('end', function (info) {
      done();
    });
  }
  // Test that the default setting for DATEFORMAT is mdy
  it('should test date format default', (done) => {
    testDateFormat(done, undefined);
  })

  // Test that the DATEFORMAT setting can be changed via an optional configuration
  it('should test custom dateformat', (done) => {
    testDateFormat(done, 'dmy');
  })
})

describe('Boolean Config Options Test', () => {
  function testBooleanConfigOption(done, optionName, optionValue, optionFlag, defaultOn) {
    let config = getConfig();
    config.options[optionName] = optionValue;
    let connection = new Connection(config);

    let request = new Request(
      `SELECT (${optionFlag} & @@OPTIONS) AS OPTION_FLAG_OR_ZERO;`,
      function (err, rowCount) {
        assert.ifError(err);
        assert.strictEqual(rowCount, 1);

        connection.close();
      }
    );

    request.on('columnMetadata', function (columnsMetadata) {
      assert.strictEqual(Object.keys(columnsMetadata).length, 1);
    });

    request.on('row', function (columns) {
      assert.strictEqual(Object.keys(columns).length, 1);

      let expectedValue;
      if (optionValue === true || (optionValue === undefined && defaultOn)) {
        expectedValue = optionFlag;
      } else {
        expectedValue = 0;
      }

      assert.strictEqual(columns[0].value, expectedValue);
    });

    connection.on('connect', function (err) {
      assert.ifError(err);

      connection.execSql(request);
    });

    connection.on('end', function (info) {
      done();
    });
  }


  function testBadBooleanConfigOption(done, optionName) {
    let config = getConfig();
    config.options[optionName] = 'on';

    assert.throws(function () {
      new Connection(config);
    });

    done();
  }

  it('should test ansi null default', (done)=> {
    testBooleanConfigOption(done, 'enableAnsiNull', undefined, 32, true);
  })

  it('should test ansi null on', (done) => {
    testBooleanConfigOption(done, 'enableAnsiNull', true, 32, true);
  })

  it('should test ansi null off', (done) => {
    testBooleanConfigOption(done, 'enableAnsiNull', false, 32, true);
  })

  it('should test bad ansi null', (done) => {
    testBadBooleanConfigOption(done, 'enableAnsiNull');
  })

  it('should test ansi null default default', (done) => {
    testBooleanConfigOption(done, 'enableAnsiNullDefault', undefined, 1024, true);
  })

  it('should test ansi null default on', (done) => {
    testBooleanConfigOption(done, 'enableAnsiNullDefault', true, 1024, true);
  })

  it('should test ansi null default off', (done) => {
     testBooleanConfigOption(done, 'enableAnsiNullDefault', false, 1024, true);
  })

  it('should test bad ansi null default', (done) => {
     testBadBooleanConfigOption(done, 'enableAnsiNullDefault');
  })

  it('should test ansi padding default', (done) => {
    testBooleanConfigOption(done, 'enableAnsiPadding', undefined, 16, true);
  })

  it('should test ansi padding on', (done) => {
     testBooleanConfigOption(done, 'enableAnsiPadding', true, 16, true);
  })

  it('should test ansi padding off', (done) => {
    testBooleanConfigOption(done, 'enableAnsiPadding', false, 16, true);
  })

  it('should test bad ansi padding', (done) => {
    testBadBooleanConfigOption(done, 'enableAnsiPadding');
  })

  it('should test ansi warnings default', (done) => {
    testBooleanConfigOption(done, 'enableAnsiWarnings', undefined, 8, true);
  })

  it('should test ansi warnings on', (done) => {
    testBooleanConfigOption(done, 'enableAnsiWarnings', true, 8, true);
  })

  it('should test ansi warnings off', (done) => {
    testBooleanConfigOption(done, 'enableAnsiWarnings', false, 8, true);
  })

  it('should test bad ansi warnings', (done) => {
    testBadBooleanConfigOption(done, 'enableAnsiWarnings');
  })

  it('should test arith abort default', (done) => {
    testBooleanConfigOption(done, 'enableArithAbort', undefined, 64, false);
  })

  it('should test arith abort on', (done) => {
    testBooleanConfigOption(done, 'enableArithAbort', true, 64, false);
  })

  it('should test arith abort off', (done) => {
    testBooleanConfigOption(done, 'enableArithAbort', false, 64, false);
  })

  it('should test bad arith abort', (done) => {
    testBadBooleanConfigOption(done, 'enableArithAbort');
  })

  it('should test concat null yield null default', (done) => {
    testBooleanConfigOption(done, 'enableConcatNullYieldsNull', undefined, 4096, true);
  })

  it('should test concat null yields null on', (done) => {
    testBooleanConfigOption(done, 'enableConcatNullYieldsNull', true, 4096, true);
  })

  it('should test ocncat null yields null off', (done) => {
    testBooleanConfigOption(done, 'enableConcatNullYieldsNull', false, 4096, true);
  })

  it('should test bad concat null yields null', (done) => {
    testBadBooleanConfigOption(done, 'enableConcatNullYieldsNull');
  })

  it('should test cursor close on commit default', (done) => {
    testBooleanConfigOption(done, 'enableCursorCloseOnCommit', undefined, 4, false);
  })

  it('should test cursor close on commit on', (done) => {
    testBooleanConfigOption(done, 'enableCursorCloseOnCommit', true, 4, false);
  })

  it('should test cursor close on commit off', (done) => {
    testBooleanConfigOption(done, 'enableCursorCloseOnCommit', false, 4, false);
  })

  it('should test bad cursor close on commit', (done) => {
    testBadBooleanConfigOption(done, 'enableCursorCloseOnCommit');
  })

  it('should test implicit transactions default', (done) => {
    testBooleanConfigOption(done, 'enableImplicitTransactions', undefined, 2, false);
  })

  it('should test implicit transactions on', (done) => {
    testBooleanConfigOption(done, 'enableImplicitTransactions', true, 2, false);
  })

  it('should test implicit transactions off', (done) => {
     testBooleanConfigOption(done, 'enableImplicitTransactions', false, 2, false);
  })

  it('should test bad implicit transactions', (done) => {
    testBadBooleanConfigOption(done, 'enableImplicitTransactions');
  })

  it('should test numeric round abort default', (done) => {
    testBooleanConfigOption(done, 'enableNumericRoundabort', undefined, 8192, false);
  })

  it('should test numeric round abort on', (done) => {
    testBooleanConfigOption(done, 'enableNumericRoundabort', true, 8192, false);
  })

  it('should test numeric round abort off', (done) => {
    testBooleanConfigOption(done, 'enableNumericRoundabort', false, 8192, false);
  })

  it('should test bad numeric round abort', (done) => {
    testBadBooleanConfigOption(done, 'enableNumericRoundabort');
  })

  it('should test quoted identifier default', (done) => {
    testBooleanConfigOption(done, 'enableQuotedIdentifier', undefined, 256, true);
  })

  it('should test quoted identifier on', (done) => {
    testBooleanConfigOption(done, 'enableQuotedIdentifier', true, 256, true);
  })

  it('should test quoted identifier off', (done) => {
    testBooleanConfigOption(done, 'enableQuotedIdentifier', false, 256, true);
  })

  it('should test bad quoted identifier', (done) => {
    testBadBooleanConfigOption(done, 'enableQuotedIdentifier');
  })

  it('should test abort transaction on error default', (done) => {
     testBooleanConfigOption(done, 'abortTransactionOnError', undefined, 16384, false);
  })

  it('should test abort transaction on error on', (done) => {
    testBooleanConfigOption(done, 'abortTransactionOnError', true, 16384, false);
  })
  
  it('should test abort transaction on error off', (done) => {
    testBooleanConfigOption(done, 'abortTransactionOnError', false, 16384, false);
  })

  it('should test bad abort transaction on error', (done) => {
     testBadBooleanConfigOption(done, 'abortTransactionOnError');
  })
})

