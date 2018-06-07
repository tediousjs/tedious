var async = require('async');
var Connection = require('../../src/connection');
var Request = require('../../src/request');
var fs = require('fs');

var getConfig = function() {
  var config = JSON.parse(
    fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')
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
};

process.on('uncaughtException', function(err) {
  console.error(err.stack);
});

var getInstanceName = function() {
  return JSON.parse(
    fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')
  ).instanceName;
};

var getNtlmConfig = function() {
  return JSON.parse(
    fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')
  ).ntlm;
};

exports.badServer = function(test) {
  var config = getConfig();
  config.server = 'bad-server';

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    test.ok(err);
  });

  connection.on('end', function(info) {
    test.done();
  });

  return connection.on('debug', function(text) {
    //console.log(text)
  });
};

exports.badPort = function(test) {
  var config = getConfig();
  config.options.port = -1;
  config.options.connectTimeout = 200;

  test.throws(function() {
    new Connection(config);
  });

  test.done();
};

exports.badCredentials = function(test) {
  test.expect(2);

  var config = getConfig();
  config.password = 'bad-password';

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    test.ok(err);

    connection.close();
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('infoMessage', function(info) {
    //console.log("#{info.number} : #{info.message}")
  });

  connection.on('errorMessage', function(error) {
    //console.log("#{error.number} : #{error.message}")
    return test.ok(~error.message.indexOf('failed'));
  });

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
};

exports.connectByPort = function(test) {
  var config = getConfig();

  if ((config.options != null ? config.options.port : undefined) == null) {
    // Config says don't do this test (probably because ports are dynamic).
    console.log('Skipping connectByPort test');
    test.done();
    return;
  }

  test.expect(2);

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    test.ifError(err);

    connection.close();
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('databaseChange', function(database) {
    test.strictEqual(database, config.options.database);
  });

  connection.on('infoMessage', function(info) {
    //console.log("#{info.number} : #{info.message}")
  });

  return connection.on('debug', function(text) {
    //console.log(text)
  });
};

exports.connectByInstanceName = function(test) {
  if (!getInstanceName()) {
    // Config says don't do this test (probably because SQL Server Browser is not available).
    console.log('Skipping connectByInstanceName test');
    test.done();
    return;
  }

  test.expect(2);

  var config = getConfig();
  delete config.options.port;
  config.options.instanceName = getInstanceName();

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    test.ifError(err);

    connection.close();
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('databaseChange', function(database) {
    test.strictEqual(database, config.options.database);
  });

  connection.on('infoMessage', function(info) {
    //console.log("#{info.number} : #{info.message}")
  });

  return connection.on('debug', function(text) {
    //console.log(text)
  });
};

exports.connectByInvalidInstanceName = function(test) {
  if (!getInstanceName()) {
    // Config says don't do this test (probably because SQL Server Browser is not available).
    console.log('Skipping connectByInvalidInstanceName test');
    test.done();
    return;
  }

  test.expect(1);

  var config = getConfig();
  delete config.options.port;
  config.options.instanceName = `${getInstanceName()}X`;

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    test.ok(err);

    connection.close();
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('infoMessage', function(info) {
    //console.log("#{info.number} : #{info.message}")
  });

  return connection.on('debug', function(text) {
    //console.log(text)
  });
};

var DomainCaseEnum = {
  AsIs: 0,
  Lower: 1,
  Upper: 2,
};

var runNtlmTest = function(test, domainCase) {
  if (!getNtlmConfig()) {
    console.log('Skipping ntlm test');
    test.done();
    return;
  }

  test.expect(1);

  var config = getConfig();
  var ntlmConfig = getNtlmConfig();

  config.userName = ntlmConfig.userName;
  config.password = ntlmConfig.password;

  switch (domainCase) {
    case DomainCaseEnum.AsIs:
      config.domain = ntlmConfig.domain;
      break;
    case DomainCaseEnum.Lower:
      config.domain = ntlmConfig.domain.toLowerCase();
      break;
    case DomainCaseEnum.Upper:
      config.domain = ntlmConfig.domain.toUpperCase();
      break;
    default:
      test.ok(false, 'Unexpected value for domainCase: ' + domainCase);
  }

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    test.ifError(err);

    connection.close();
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('infoMessage', function(info) {
    //console.log("#{info.number} : #{info.message}")
  });

  return connection.on('debug', function(text) {
    //console.log(text)
  });
};

exports.ntlm = function(test) {
  runNtlmTest(test, DomainCaseEnum.AsIs);
};

exports.ntlmLower = function(test) {
  runNtlmTest(test, DomainCaseEnum.Lower);
};

exports.ntlmUpper = function(test) {
  runNtlmTest(test, DomainCaseEnum.Upper);
};

exports.encrypt = function(test) {
  test.expect(5);

  var config = getConfig();
  config.options.encrypt = true;

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    test.ifError(err);

    connection.close();
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('rerouting', function(info) {
    test.expect(8);
  });

  connection.on('databaseChange', function(database) {
    test.strictEqual(database, config.options.database);
  });

  connection.on('secure', function(cleartext) {
    test.ok(cleartext);
    test.ok(cleartext.getCipher());
    test.ok(cleartext.getPeerCertificate());
  });

  connection.on('infoMessage', function(info) {
    //console.log("#{info.number} : #{info.message}")
  });

  return connection.on('debug', function(text) {
    //console.log(text)
  });
};

exports['does not emit error after connect timeout'] = function(test) {
  const config = getConfig();
  config.options.connectTimeout = 1;

  const connection = new Connection(config);
  connection.on('error', (error) => { test.ifError(error); });
  connection.on('connect', (err) => {});

  setTimeout(() => { test.done(); }, 500);
};

exports.execSql = function(test) {
  test.expect(7);

  var config = getConfig();

  var request = new Request('select 8 as C1', function(err, rowCount) {
    test.ifError(err);
    test.strictEqual(rowCount, 1);

    connection.close();
  });

  request.on('doneInProc', function(rowCount, more) {
    test.ok(more);
    test.strictEqual(rowCount, 1);
  });

  request.on('columnMetadata', function(columnsMetadata) {
    test.strictEqual(columnsMetadata.length, 1);
  });

  request.on('row', function(columns) {
    test.strictEqual(columns.length, 1);
    test.strictEqual(columns[0].value, 8);
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    connection.execSql(request);
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('infoMessage', function(info) {
    //console.log("#{info.number} : #{info.message}")
  });

  return connection.on('debug', function(text) {
    //console.log(text)
  });
};

exports.numericColumnName = function(test) {
  test.expect(5);

  var config = getConfig();
  config.options.useColumnNames = true;

  var request = new Request('select 8 as [123]', function(err, rowCount) {
    test.ifError(err);
    test.strictEqual(rowCount, 1);

    connection.close();
  });

  request.on('columnMetadata', function(columnsMetadata) {
    test.strictEqual(Object.keys(columnsMetadata).length, 1);
  });

  request.on('row', function(columns) {
    test.strictEqual(Object.keys(columns).length, 1);
    test.strictEqual(columns[123].value, 8);
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    connection.execSql(request);
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('infoMessage', function(info) {
    //console.log("#{info.number} : #{info.message}")
  });

  connection.on('debug', function(text) {
    //console.log(text)
  });
};

exports.duplicateColumnNames = function(test) {
  test.expect(6);

  var config = getConfig();
  config.options.useColumnNames = true;

  var request = new Request("select 1 as abc, 2 as xyz, '3' as abc", function(
    err,
    rowCount
  ) {
    test.ifError(err);
    test.strictEqual(rowCount, 1);

    connection.close();
  });

  request.on('columnMetadata', function(columnsMetadata) {
    test.strictEqual(Object.keys(columnsMetadata).length, 2);
  });

  request.on('row', function(columns) {
    test.strictEqual(Object.keys(columns).length, 2);

    test.strictEqual(columns.abc.value, 1);
    test.strictEqual(columns.xyz.value, 2);
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    connection.execSql(request);
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('infoMessage', function(info) {
    //console.log("#{info.number} : #{info.message}")
  });

  connection.on('debug', function(text) {
    //console.log(text)
  });
};

exports.execSqlMultipleTimes = function(test) {
  var timesToExec = 5;
  var sqlExecCount = 0;

  test.expect(timesToExec * 7);

  var config = getConfig();

  var execSql = function() {
    if (sqlExecCount === timesToExec) {
      connection.close();
      return;
    }

    var request = new Request('select 8 as C1', function(err, rowCount) {
      test.ifError(err);
      test.strictEqual(rowCount, 1);

      sqlExecCount++;
      execSql();
    });

    request.on('doneInProc', function(rowCount, more) {
      test.ok(more);
      test.strictEqual(rowCount, 1);
    });

    request.on('columnMetadata', function(columnsMetadata) {
      test.strictEqual(columnsMetadata.length, 1);
    });

    request.on('row', function(columns) {
      test.strictEqual(columns.length, 1);
      test.strictEqual(columns[0].value, 8);
    });

    connection.execSql(request);
  };

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    execSql();
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('infoMessage', function(info) {
    //console.log("#{info.number} : #{info.message}")
  });

  connection.on('debug', function(text) {
    //console.log(text)
  });
};

exports.execSqlWithOrder = function(test) {
  test.expect(10);

  var config = getConfig();

  var sql =
    'select top 2 object_id, name, column_id, system_type_id from sys.columns order by name, system_type_id';
  var request = new Request(sql, function(err, rowCount) {
    test.ifError(err);
    test.strictEqual(rowCount, 2);

    connection.close();
  });

  request.on('doneInProc', function(rowCount, more) {
    test.ok(more);
    test.strictEqual(rowCount, 2);
  });

  request.on('columnMetadata', function(columnsMetadata) {
    test.strictEqual(columnsMetadata.length, 4);
  });

  request.on('order', function(orderColumns) {
    test.strictEqual(orderColumns.length, 2);
    test.strictEqual(orderColumns[0], 2);
    test.strictEqual(orderColumns[1], 4);
  });

  request.on('row', function(columns) {
    test.strictEqual(columns.length, 4);
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    connection.execSql(request);
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('infoMessage', function(info) {
    //console.log("#{info.number} : #{info.message}")
  });

  connection.on('errorMessage', function(error) {
    //console.log("#{error.number} : #{error.message}")
  });

  connection.on('debug', function(text) {
    //console.log(text)
  });
};

exports.execBadSql = function(test) {
  test.expect(2);

  var config = getConfig();

  var request = new Request('bad syntax here', function(err) {
    test.ok(err);

    connection.close();
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    connection.execSql(request);
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('errorMessage', function(error) {
    //console.log("#{error.number} : #{error.message}")
    test.ok(error);
  });

  connection.on('debug', function(text) {
    //console.log(text)
  });
};

exports.closeConnectionRequestPending = function(test) {
  test.expect(1);

  var config = getConfig();

  var request = new Request('select 8 as C1', function(err, rowCount) {
    test.ok(err);
    test.strictEqual(err.code, 'ECLOSE');
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    test.ifError(err);
    connection.execSql(request);

    // This should trigger request callback with error as there is
    // request pending now.
    connection.close();
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('error', function(err) {
  });

  connection.on('infoMessage', function(info) {
    //console.log("#{info.number} : #{info.message}")
  });

  connection.on('debug', function(text) {
    //console.log(text)
  });
};

exports.sqlWithMultipleResultSets = function(test) {
  test.expect(8);

  var config = getConfig();
  var row = 0;

  var request = new Request('select 1; select 2;', function(err, rowCount) {
    test.ifError(err);
    test.strictEqual(rowCount, 2);

    connection.close();
  });

  request.on('doneInProc', function(rowCount, more) {
    test.strictEqual(rowCount, 1);
  });

  request.on('columnMetadata', function(columnsMetadata) {
    test.strictEqual(columnsMetadata.length, 1);
  });

  request.on('row', function(columns) {
    test.strictEqual(columns[0].value, ++row);
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    connection.execSql(request);
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('infoMessage', function(info) {
    //console.log("#{info.number} : #{info.message}")
  });

  connection.on('debug', function(text) {
    //console.log(text)
  });
};

exports.rowCountForUpdate = function(test) {
  test.expect(2);

  var config = getConfig();

  var setupSql = `\
create table #tab1 (id int, name nvarchar(10));
insert into #tab1 values(1, N'a1');
insert into #tab1 values(2, N'a2');
insert into #tab1 values(3, N'b1');
update #tab1 set name = 'a3' where name like 'a%'\
`;

  var request = new Request(setupSql, function(err, rowCount) {
    test.ifError(err);
    test.strictEqual(rowCount, 5);
    connection.close();
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    connection.execSql(request);
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('infoMessage', function(info) {
    //console.log("#{info.number} : #{info.message}")
  });

  connection.on('debug', function(text) {
    //console.log(text)
  });
};

exports.rowCollectionOnRequestCompletion = function(test) {
  test.expect(5);

  var config = getConfig();
  config.options.rowCollectionOnRequestCompletion = true;

  var request = new Request('select 1 as a; select 2 as b;', function(
    err,
    rowCount,
    rows
  ) {
    test.strictEqual(rows.length, 2);

    test.strictEqual(rows[0][0].metadata.colName, 'a');
    test.strictEqual(rows[0][0].value, 1);
    test.strictEqual(rows[1][0].metadata.colName, 'b');
    test.strictEqual(rows[1][0].value, 2);

    connection.close();
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    connection.execSql(request);
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('infoMessage', function(info) {
    //console.log("#{info.number} : #{info.message}")
  });

  connection.on('debug', function(text) {
    //console.log(text)
  });
};

exports.rowCollectionOnDone = function(test) {
  test.expect(6);

  var config = getConfig();
  config.options.rowCollectionOnDone = true;

  var doneCount = 0;

  var request = new Request('select 1 as a; select 2 as b;', function(
    err,
    rowCount,
    rows
  ) {
    connection.close();
  });

  request.on('doneInProc', function(rowCount, more, rows) {
    test.strictEqual(rows.length, 1);

    switch (++doneCount) {
      case 1:
        test.strictEqual(rows[0][0].metadata.colName, 'a');
        test.strictEqual(rows[0][0].value, 1);
        break;
      case 2:
        test.strictEqual(rows[0][0].metadata.colName, 'b');
        test.strictEqual(rows[0][0].value, 2);
        break;
    }
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    connection.execSql(request);
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('infoMessage', function(info) {
    //console.log("#{info.number} : #{info.message}")
  });

  connection.on('debug', function(text) {
    //console.log(text)
  });
};

exports.execProcAsSql = function(test) {
  test.expect(7);

  var config = getConfig();

  var request = new Request('exec sp_help int', function(err, rowCount) {
    test.ifError(err);
    test.strictEqual(rowCount, 0);

    connection.close();
  });

  request.on('doneProc', function(rowCount, more, returnStatus) {
    test.ok(!more);
    test.strictEqual(returnStatus, 0);
  });

  request.on('doneInProc', function(rowCount, more) {
    test.ok(more);
  });

  request.on('row', function(columns) {
    test.ok(true);
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    connection.execSql(request);
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('infoMessage', function(info) {
    //console.log("#{info.number} : #{info.message}")
  });

  connection.on('debug', function(text) {
    //console.log(text)
  });
};

exports.resetConnection = function(test) {
  test.expect(4);

  var config = getConfig();

  var testAnsiNullsOptionOn = function(callback) {
    testAnsiNullsOption(true, callback);
  };

  var testAnsiNullsOptionOff = function(callback) {
    testAnsiNullsOption(false, callback);
  };

  var testAnsiNullsOption = function(expectedOptionOn, callback) {
    var request = new Request('select @@options & 32', function(err, rowCount) {
      callback(err);
    });

    request.on('row', function(columns) {
      var optionOn = columns[0].value === 32;
      test.strictEqual(optionOn, expectedOptionOn);
    });

    connection.execSql(request);
  };

  var setAnsiNullsOptionOff = function(callback) {
    var request = new Request('set ansi_nulls off', function(err, rowCount) {
      callback(err);
    });

    connection.execSqlBatch(request);
  };

  var connection = new Connection(config);

  connection.on('resetConnection', function() {
    test.ok(true);
  });

  connection.on('connect', function(err) {
    async.series([
      testAnsiNullsOptionOn,
      setAnsiNullsOptionOff,
      testAnsiNullsOptionOff,
      function(callback) {
        connection.reset(function(err) {
          if (connection.config.options.tdsVersion < '7_2') {
            // TDS 7_1 doesnt send RESETCONNECTION acknowledgement packet
            test.ok(true);
          }

          callback(err);
        });
      },
      testAnsiNullsOptionOn,
      function(callback) {
        connection.close();
        callback();
      },
    ]);
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('infoMessage', function(info) {
    //console.log("#{info.number} : #{info.message}")
  });

  connection.on('debug', function(text) {
    //console.log(text)
  });
};

exports.cancelRequest = function(test) {
  test.expect(8);

  var config = getConfig();

  var request = new Request(
    "select 1 as C1;waitfor delay '00:00:05';select 2 as C2",
    function(err, rowCount, rows) {
      test.strictEqual(err.message, 'Canceled.');

      connection.close();
    }
  );

  request.on('doneInProc', function(rowCount, more) {
    test.ok(false);
  });

  request.on('doneProc', function(rowCount, more) {
    test.ok(!rowCount);
    test.strictEqual(more, false);
  });

  request.on('done', function(rowCount, more, rows) {
    test.ok(!rowCount);
    test.strictEqual(more, false);
  });

  request.on('columnMetadata', function(columnsMetadata) {
    test.strictEqual(columnsMetadata.length, 1);
  });

  request.on('row', function(columns) {
    test.strictEqual(columns.length, 1);
    test.strictEqual(columns[0].value, 1);
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    connection.execSql(request);
    setTimeout(connection.cancel.bind(connection), 2000);
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('infoMessage', function(info) {
    //console.log("#{info.number} : #{info.message}")
  });

  connection.on('debug', function(text) {
    //console.log(text)
  });
};

exports.requestTimeout = function(test) {
  test.expect(8);

  var config = getConfig();
  config.options.requestTimeout = 1000;

  var request = new Request(
    "select 1 as C1;waitfor delay '00:00:05';select 2 as C2",
    function(err, rowCount, rows) {
      test.equal(err.message, 'Timeout: Request failed to complete in 1000ms');

      connection.close();
    }
  );

  request.on('doneInProc', function(rowCount, more) {
    test.ok(false);
  });

  request.on('doneProc', function(rowCount, more) {
    test.ok(!rowCount);
    test.strictEqual(more, false);
  });

  request.on('done', function(rowCount, more, rows) {
    test.ok(!rowCount);
    test.strictEqual(more, false);
  });

  request.on('columnMetadata', function(columnsMetadata) {
    test.strictEqual(columnsMetadata.length, 1);
  });

  request.on('row', function(columns) {
    test.strictEqual(columns.length, 1);
    test.strictEqual(columns[0].value, 1);
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    connection.execSql(request);
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('infoMessage', function(info) {
    //console.log("#{info.number} : #{info.message}")
  });

  connection.on('debug', function(text) {
    //console.log(text)
  });
};

var runSqlBatch = function(test, config, sql, requestCallback) {
  var connection = new Connection(config);

  var request = new Request(sql, function() {
    requestCallback.apply(this, arguments);
    connection.close();
  });

  connection.on('connect', function(err) {
    test.ifError(err);
    connection.execSqlBatch(request);
  });

  connection.on('end', function(info) {
    test.done();
  });
};

// Test that the default behavior allows adding null values to a
// temporary table where the nullability is not explicitly declared.
exports.testAnsiNullDefault = function(test) {
  test.expect(2);

  var sql =
    'create table #testAnsiNullDefault (id int);\n' +
    'insert #testAnsiNullDefault values (null);\n' +
    'drop table #testAnsiNullDefault;';

  runSqlBatch(test, getConfig(), sql, function(err) {
    test.ifError(err);
  });
};

// Test that the default behavior can be overridden (so that temporary
// table columns are non-nullable by default).
exports.disableAnsiNullDefault = function(test) {
  test.expect(3);

  var sql =
    'create table #testAnsiNullDefaults (id int);\n' +
    'insert #testAnsiNullDefaults values (null);\n' +
    'drop table #testAnsiNullDefaults;';

  var config = getConfig();
  config.options.enableAnsiNullDefault = false;

  runSqlBatch(test, config, sql, function(err) {
    test.ok(err instanceof Error);
    test.strictEqual(err != null ? err.number : undefined, 515);
  }); // Cannot insert the value NULL
};

var testDateFirstImpl = (test, datefirst) => {
  datefirst = datefirst || 7;
  test.expect(3);
  var config = getConfig();
  config.options.datefirst = datefirst;

  var connection = new Connection(config);

  var request = new Request('select @@datefirst', function(err) {
    test.ifError(err);
    connection.close();
  });

  request.on('row', function(columns) {
    var dateFirstActual = columns[0].value;
    test.strictEqual(dateFirstActual, datefirst);
  });

  connection.on('connect', function(err) {
    test.ifError(err);
    connection.execSql(request);
  });

  connection.on('end', function(info) {
    test.done();
  });
};

// Test that the default setting for DATEFIRST is 7
exports.testDatefirstDefault = function(test) {
  testDateFirstImpl(test, undefined);
};

// Test that the DATEFIRST setting can be changed via an optional configuration
exports.testDatefirstCustom = function(test) {
  testDateFirstImpl(test, 3);
};

// Test that an invalid DATEFIRST setting throws
exports.badDatefirst = function(test) {
  test.expect(1);
  var config = getConfig();
  config.options.datefirst = -1;

  test.throws(function() {
    new Connection(config);
  });

  test.done();
};


var testLanguage = function(test, language) {
  language = language || 'us_english';
  test.expect(3);
  var config = getConfig();
  config.options.language = language;

  var connection = new Connection(config);

  var request = new Request('select @@language', function(err) {
    test.ifError(err);
    connection.close();
  });

  request.on('row', function(columns) {
    var languageActual = columns[0].value;
    test.strictEqual(languageActual, language);
  });

  connection.on('connect', function(err) {
    test.ifError(err);
    connection.execSql(request);
  });

  connection.on('end', function(info) {
    test.done();
  });
};

// Test that the default setting for LANGUAGE is us_english
exports.testLanguageDefault = function(test) {
  testLanguage(test, undefined);
};

// Test that the LANGUAGE setting can be changed via an optional configuration
exports.testLanguageCustom = function(test) {
  testLanguage(test, 'Deutsch');
};

var testDateFormat = function(test, dateFormat) {
  dateFormat = dateFormat || 'mdy';
  test.expect(3);
  var config = getConfig();
  config.options.dateFormat = dateFormat;

  var connection = new Connection(config);

  var request = new Request(
    'SELECT DATE_FORMAT FROM sys.dm_exec_sessions WHERE SESSION_ID = @@SPID ',
    function(err) {
      test.ifError(err);
      connection.close();
    }
  );

  request.on('row', function(columns) {
    var dateFormatActual = columns[0].value;
    test.strictEqual(dateFormatActual, dateFormat);
  });

  connection.on('connect', function(err) {
    test.ifError(err);
    connection.execSql(request);
  });

  connection.on('end', function(info) {
    test.done();
  });
};

// Test that the default setting for DATEFORMAT is mdy
exports.testDateFormatDefault = function(test) {
  testDateFormat(test, undefined);
};

// Test that the DATEFORMAT setting can be changed via an optional configuration
exports.testDateFormatCustom = function(test) {
  testDateFormat(test, 'dmy');
};

var testBooleanConfigOption = function(test, optionName, optionValue, optionFlag, defaultOn) {
  test.expect(5);

  var config = getConfig();
  config.options[optionName] = optionValue;
  var connection = new Connection(config);

  var request = new Request(
    `SELECT (${optionFlag} & @@OPTIONS) AS OPTION_FLAG_OR_ZERO;`,
    function(err, rowCount) {
      test.ifError(err);
      test.strictEqual(rowCount, 1);

      connection.close();
    }
  );

  request.on('columnMetadata', function(columnsMetadata) {
    test.strictEqual(Object.keys(columnsMetadata).length, 1);
  });

  request.on('row', function(columns) {
    test.strictEqual(Object.keys(columns).length, 1);

    var expectedValue;
    if (optionValue === true || (optionValue === undefined && defaultOn)) {
      expectedValue = optionFlag;
    } else {
      expectedValue = 0;
    }

    test.strictEqual(columns[0].value, expectedValue);
  });

  connection.on('connect', function(err) {
    connection.execSql(request);
  });

  connection.on('end', function(info) {
    test.done();
  });
};

var testBadBooleanConfigOption = function(test, optionName) {
  var config = getConfig();
  config.options[optionName] = 'on';

  test.throws(function() {
    new Connection(config);
  });

  test.done();
};

exports.testAnsiNullDefault = function(test) {
  testBooleanConfigOption(test, 'enableAnsiNull', undefined, 32, true);
};

exports.testAnsiNullOn = function(test) {
  testBooleanConfigOption(test, 'enableAnsiNull', true, 32, true);
};

exports.testAnsiNullOff = function(test) {
  testBooleanConfigOption(test, 'enableAnsiNull', false, 32, true);
};

exports.badAnsiNull = function(test) {
  testBadBooleanConfigOption(test, 'enableAnsiNull');
};

exports.testAnsiNullDefaultDefault = function(test) {
  testBooleanConfigOption(test, 'enableAnsiNullDefault', undefined, 1024, true);
};

exports.testAnsiNullDefaultOn = function(test) {
  testBooleanConfigOption(test, 'enableAnsiNullDefault', true, 1024, true);
};

exports.testAnsiNullDefaultOff = function(test) {
  testBooleanConfigOption(test, 'enableAnsiNullDefault', false, 1024, true);
};

exports.badAnsiNullDefault = function(test) {
  testBadBooleanConfigOption(test, 'enableAnsiNullDefault');
};

exports.testAnsiPaddingDefault = function(test) {
  testBooleanConfigOption(test, 'enableAnsiPadding', undefined, 16, true);
};

exports.testAnsiPaddingOn = function(test) {
  testBooleanConfigOption(test, 'enableAnsiPadding', true, 16, true);
};

exports.testAnsiPaddingOff = function(test) {
  testBooleanConfigOption(test, 'enableAnsiPadding', false, 16, true);
};

exports.badAnsiPadding = function(test) {
  testBadBooleanConfigOption(test, 'enableAnsiPadding');
};

exports.testAnsiWarningsDefault = function(test) {
  testBooleanConfigOption(test, 'enableAnsiWarnings', undefined, 8, true);
};

exports.testAnsiWarningsOn = function(test) {
  testBooleanConfigOption(test, 'enableAnsiWarnings', true, 8, true);
};

exports.testAnsiWarningsOff = function(test) {
  testBooleanConfigOption(test, 'enableAnsiWarnings', false, 8, true);
};

exports.badAnsiWarnings = function(test) {
  testBadBooleanConfigOption(test, 'enableAnsiWarnings');
};

exports.testArithAbortDefault = function(test) {
  testBooleanConfigOption(test, 'enableArithAbort', undefined, 64, false);
};

exports.testArithAbortOn = function(test) {
  testBooleanConfigOption(test, 'enableArithAbort', true, 64, false);
};

exports.testArithAbortOff = function(test) {
  testBooleanConfigOption(test, 'enableArithAbort', false, 64, false);
};

exports.badArithAbort = function(test) {
  testBadBooleanConfigOption(test, 'enableArithAbort');
};

exports.testConcatNullYieldsNullDefault = function(test) {
  testBooleanConfigOption(test, 'enableConcatNullYieldsNull', undefined, 4096, true);
};

exports.testConcatNullYieldsNullOn = function(test) {
  testBooleanConfigOption(test, 'enableConcatNullYieldsNull', true, 4096, true);
};

exports.testConcatNullYieldsNullOff = function(test) {
  testBooleanConfigOption(test, 'enableConcatNullYieldsNull', false, 4096, true);
};

exports.badConcatNullYieldsNull = function(test) {
  testBadBooleanConfigOption(test, 'enableConcatNullYieldsNull');
};

exports.testCursorCloseOnCommitDefault = function(test) {
  testBooleanConfigOption(test, 'enableCursorCloseOnCommit', undefined, 4, false);
};

exports.testCursorCloseOnCommitOn = function(test) {
  testBooleanConfigOption(test, 'enableCursorCloseOnCommit', true, 4, false);
};

exports.testCursorCloseOnCommitOff = function(test) {
  testBooleanConfigOption(test, 'enableCursorCloseOnCommit', false, 4, false);
};

exports.badCursorCloseOnCommit = function(test) {
  testBadBooleanConfigOption(test, 'enableCursorCloseOnCommit');
};

exports.testImplicitTransactionsDefault = function(test) {
  testBooleanConfigOption(test, 'enableImplicitTransactions', undefined, 2, false);
};

exports.testImplicitTransactionsOn = function(test) {
  testBooleanConfigOption(test, 'enableImplicitTransactions', true, 2, false);
};

exports.testImplicitTransactionsOff = function(test) {
  testBooleanConfigOption(test, 'enableImplicitTransactions', false, 2, false);
};

exports.badImplicitTransactions = function(test) {
  testBadBooleanConfigOption(test, 'enableImplicitTransactions');
};

exports.testNumericRoundabortDefault = function(test) {
  testBooleanConfigOption(test, 'enableNumericRoundabort', undefined, 8192, false);
};

exports.testNumericRoundabortOn = function(test) {
  testBooleanConfigOption(test, 'enableNumericRoundabort', true, 8192, false);
};

exports.testNumericRoundabortOff = function(test) {
  testBooleanConfigOption(test, 'enableNumericRoundabort', false, 8192, false);
};

exports.badNumericRoundabort = function(test) {
  testBadBooleanConfigOption(test, 'enableNumericRoundabort');
};

exports.testQuotedIdentifierDefault = function(test) {
  testBooleanConfigOption(test, 'enableQuotedIdentifier', undefined, 256, true);
};

exports.testQuotedIdentifierOn = function(test) {
  testBooleanConfigOption(test, 'enableQuotedIdentifier', true, 256, true);
};

exports.testQuotedIdentifierOff = function(test) {
  testBooleanConfigOption(test, 'enableQuotedIdentifier', false, 256, true);
};

exports.badQuotedIdentifier = function(test) {
  testBadBooleanConfigOption(test, 'enableQuotedIdentifier');
};

exports.testAbortTransactionOnErrorDefault = function(test) {
  testBooleanConfigOption(test, 'abortTransactionOnError', undefined, 16384, false);
};

exports.testAbortTransactionOnErrorOn = function(test) {
  testBooleanConfigOption(test, 'abortTransactionOnError', true, 16384, false);
};

exports.testAbortTransactionOnErrorOff = function(test) {
  testBooleanConfigOption(test, 'abortTransactionOnError', false, 16384, false);
};

exports.badAbortTransactionOnError = function(test) {
  testBadBooleanConfigOption(test, 'abortTransactionOnError');
};
