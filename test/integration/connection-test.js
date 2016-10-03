'use strict';

var Connection, DomainCaseEnum, Request, async, fs, getConfig, getInstanceName, getNtlmConfig, runNtlmTest, runSqlBatch;

async = require('async');

Connection = require('../../src/connection');

Request = require('../../src/request');

fs = require('fs');

getConfig = function() {
  var config;
  config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config;
  config.options.debug = {
    packet: true,
    data: true,
    payload: true,
    token: true,
    log: true
  };
  return config;
};

process.on('uncaughtException', function(err) {
  return console.error(err.stack);
});

getInstanceName = function() {
  return JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).instanceName;
};

getNtlmConfig = function() {
  return JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).ntlm;
};

exports.badServer = function(test) {
  var config, connection;
  config = getConfig();
  config.server = 'bad-server';
  connection = new Connection(config);
  connection.on('connect', function(err) {
    return test.ok(err);
  });
  connection.on('end', function(info) {
    return test.done();
  });
  return connection.on('debug', function(text) {});
};

exports.badPort = function(test) {
  var config;
  config = getConfig();
  config.options.port = -1;
  config.options.connectTimeout = 200;
  test.throws(function() {
    new Connection(config);
  });
  return test.done();
};

exports.badCredentials = function(test) {
  var config, connection;
  test.expect(2);
  config = getConfig();
  config.password = 'bad-password';
  connection = new Connection(config);
  connection.on('connect', function(err) {
    test.ok(err);
    return connection.close();
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('infoMessage', function(info) {});
  connection.on('errorMessage', function(error) {
    return test.ok(~error.message.indexOf('failed'));
  });
  return connection.on('debug', function(text) {});
};

exports.connectByPort = function(test) {
  var config, connection, ref;
  config = getConfig();
  if (((ref = config.options) != null ? ref.port : void 0) == null) {
    console.log('Skipping connectByPort test');
    test.done();
    return;
  }
  test.expect(2);
  connection = new Connection(config);
  connection.on('connect', function(err) {
    test.ifError(err);
    return connection.close();
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('databaseChange', function(database) {
    return test.strictEqual(database, config.options.database);
  });
  connection.on('infoMessage', function(info) {});
  return connection.on('debug', function(text) {});
};

exports.connectByInstanceName = function(test) {
  var config, connection;
  if (!getInstanceName()) {
    console.log('Skipping connectByInstanceName test');
    test.done();
    return;
  }
  test.expect(2);
  config = getConfig();
  delete config.options.port;
  config.options.instanceName = getInstanceName();
  connection = new Connection(config);
  connection.on('connect', function(err) {
    test.ifError(err);
    return connection.close();
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('databaseChange', function(database) {
    return test.strictEqual(database, config.options.database);
  });
  connection.on('infoMessage', function(info) {});
  return connection.on('debug', function(text) {});
};

exports.connectByInvalidInstanceName = function(test) {
  var config, connection;
  if (!getInstanceName()) {
    console.log('Skipping connectByInvalidInstanceName test');
    test.done();
    return;
  }
  test.expect(1);
  config = getConfig();
  delete config.options.port;
  config.options.instanceName = (getInstanceName()) + 'X';
  connection = new Connection(config);
  connection.on('connect', function(err) {
    test.ok(err);
    return connection.close();
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('infoMessage', function(info) {});
  return connection.on('debug', function(text) {});
};

DomainCaseEnum = {
  AsIs: 0,
  Lower: 1,
  Upper: 2
};

runNtlmTest = function(test, domainCase) {
  var config, connection, ntlmConfig;
  if (!getNtlmConfig()) {
    console.log('Skipping ntlm test');
    test.done();
    return;
  }
  test.expect(1);
  config = getConfig();
  ntlmConfig = getNtlmConfig();
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
  connection = new Connection(config);
  connection.on('connect', function(err) {
    test.ifError(err);
    return connection.close();
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('infoMessage', function(info) {});
  return connection.on('debug', function(text) {});
};

exports.ntlm = function(test) {
  return runNtlmTest(test, DomainCaseEnum.AsIs);
};

exports.ntlmLower = function(test) {
  return runNtlmTest(test, DomainCaseEnum.Lower);
};

exports.ntlmUpper = function(test) {
  return runNtlmTest(test, DomainCaseEnum.Upper);
};

exports.encrypt = function(test) {
  var config, connection;
  test.expect(5);
  config = getConfig();
  config.options.encrypt = true;
  connection = new Connection(config);
  connection.on('connect', function(err) {
    test.ifError(err);
    return connection.close();
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('rerouting', function(info) {
    return test.expect(8);
  });
  connection.on('databaseChange', function(database) {
    return test.strictEqual(database, config.options.database);
  });
  connection.on('secure', function(cleartext) {
    test.ok(cleartext);
    test.ok(cleartext.getCipher());
    return test.ok(cleartext.getPeerCertificate());
  });
  connection.on('infoMessage', function(info) {});
  return connection.on('debug', function(text) {});
};

exports.execSql = function(test) {
  var config, connection, request;
  test.expect(7);
  config = getConfig();
  request = new Request('select 8 as C1', function(err, rowCount) {
    test.ifError(err);
    test.strictEqual(rowCount, 1);
    return connection.close();
  });
  request.on('doneInProc', function(rowCount, more) {
    test.ok(more);
    return test.strictEqual(rowCount, 1);
  });
  request.on('columnMetadata', function(columnsMetadata) {
    return test.strictEqual(columnsMetadata.length, 1);
  });
  request.on('row', function(columns) {
    test.strictEqual(columns.length, 1);
    return test.strictEqual(columns[0].value, 8);
  });
  connection = new Connection(config);
  connection.on('connect', function(err) {
    return connection.execSql(request);
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('infoMessage', function(info) {});
  return connection.on('debug', function(text) {});
};

exports.numericColumnName = function(test) {
  var config, connection, request;
  test.expect(5);
  config = getConfig();
  config.options.useColumnNames = true;
  request = new Request('select 8 as [123]', function(err, rowCount) {
    test.ifError(err);
    test.strictEqual(rowCount, 1);
    return connection.close();
  });
  request.on('columnMetadata', function(columnsMetadata) {
    return test.strictEqual(Object.keys(columnsMetadata).length, 1);
  });
  request.on('row', function(columns) {
    test.strictEqual(Object.keys(columns).length, 1);
    return test.strictEqual(columns[123].value, 8);
  });
  connection = new Connection(config);
  connection.on('connect', function(err) {
    return connection.execSql(request);
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('infoMessage', function(info) {});
  return connection.on('debug', function(text) {});
};

exports.duplicateColumnNames = function(test) {
  var config, connection, request;
  test.expect(6);
  config = getConfig();
  config.options.useColumnNames = true;
  request = new Request('select 1 as abc, 2 as xyz, \'3\' as abc', function(err, rowCount) {
    test.ifError(err);
    test.strictEqual(rowCount, 1);
    return connection.close();
  });
  request.on('columnMetadata', function(columnsMetadata) {
    return test.strictEqual(Object.keys(columnsMetadata).length, 2);
  });
  request.on('row', function(columns) {
    test.strictEqual(Object.keys(columns).length, 2);
    test.strictEqual(columns.abc.value, 1);
    return test.strictEqual(columns.xyz.value, 2);
  });
  connection = new Connection(config);
  connection.on('connect', function(err) {
    return connection.execSql(request);
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('infoMessage', function(info) {});
  return connection.on('debug', function(text) {});
};

exports.execSqlMultipleTimes = function(test) {
  var config, connection, execSql, sqlExecCount, timesToExec;
  timesToExec = 5;
  sqlExecCount = 0;
  test.expect(timesToExec * 7);
  config = getConfig();
  execSql = function() {
    var request;
    if (sqlExecCount === timesToExec) {
      connection.close();
      return;
    }
    request = new Request('select 8 as C1', function(err, rowCount) {
      test.ifError(err);
      test.strictEqual(rowCount, 1);
      sqlExecCount++;
      return execSql();
    });
    request.on('doneInProc', function(rowCount, more) {
      test.ok(more);
      return test.strictEqual(rowCount, 1);
    });
    request.on('columnMetadata', function(columnsMetadata) {
      return test.strictEqual(columnsMetadata.length, 1);
    });
    request.on('row', function(columns) {
      test.strictEqual(columns.length, 1);
      return test.strictEqual(columns[0].value, 8);
    });
    return connection.execSql(request);
  };
  connection = new Connection(config);
  connection.on('connect', function(err) {
    return execSql();
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('infoMessage', function(info) {});
  return connection.on('debug', function(text) {});
};

exports.execSqlWithOrder = function(test) {
  var config, connection, request, sql;
  test.expect(10);
  config = getConfig();
  sql = 'select top 2 object_id, name, column_id, system_type_id from sys.columns order by name, system_type_id';
  request = new Request(sql, function(err, rowCount) {
    test.ifError(err);
    test.strictEqual(rowCount, 2);
    return connection.close();
  });
  request.on('doneInProc', function(rowCount, more) {
    test.ok(more);
    return test.strictEqual(rowCount, 2);
  });
  request.on('columnMetadata', function(columnsMetadata) {
    return test.strictEqual(columnsMetadata.length, 4);
  });
  request.on('order', function(orderColumns) {
    test.strictEqual(orderColumns.length, 2);
    test.strictEqual(orderColumns[0], 2);
    return test.strictEqual(orderColumns[1], 4);
  });
  request.on('row', function(columns) {
    return test.strictEqual(columns.length, 4);
  });
  connection = new Connection(config);
  connection.on('connect', function(err) {
    return connection.execSql(request);
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('infoMessage', function(info) {});
  connection.on('errorMessage', function(error) {});
  return connection.on('debug', function(text) {});
};

exports.execSqlMultipleTimes = function(test) {
  var config, connection, makeRequest, requestsToMake;
  test.expect(20);
  requestsToMake = 5;
  config = getConfig();
  makeRequest = function() {
    var request;
    if (requestsToMake === 0) {
      connection.close();
      return;
    }
    request = new Request('select 8 as C1', function(err, rowCount) {
      test.ifError(err);
      test.strictEqual(rowCount, 1);
      requestsToMake--;
      return makeRequest();
    });
    request.on('doneInProc', function(rowCount, more) {
      return test.strictEqual(rowCount, 1);
    });
    request.on('row', function(columns) {
      return test.strictEqual(columns.length, 1);
    });
    return connection.execSql(request);
  };
  connection = new Connection(config);
  connection.on('connect', function(err) {
    return makeRequest();
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('infoMessage', function(info) {});
  return connection.on('debug', function(text) {});
};

exports.execBadSql = function(test) {
  var config, connection, request;
  test.expect(2);
  config = getConfig();
  request = new Request('bad syntax here', function(err) {
    test.ok(err);
    return connection.close();
  });
  connection = new Connection(config);
  connection.on('connect', function(err) {
    return connection.execSql(request);
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('errorMessage', function(error) {
    return test.ok(error);
  });
  return connection.on('debug', function(text) {});
};

exports.sqlWithMultipleResultSets = function(test) {
  var config, connection, request, row;
  test.expect(8);
  config = getConfig();
  row = 0;
  request = new Request('select 1; select 2;', function(err, rowCount) {
    test.ifError(err);
    test.strictEqual(rowCount, 2);
    return connection.close();
  });
  request.on('doneInProc', function(rowCount, more) {
    return test.strictEqual(rowCount, 1);
  });
  request.on('columnMetadata', function(columnsMetadata) {
    return test.strictEqual(columnsMetadata.length, 1);
  });
  request.on('row', function(columns) {
    return test.strictEqual(columns[0].value, ++row);
  });
  connection = new Connection(config);
  connection.on('connect', function(err) {
    return connection.execSql(request);
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('infoMessage', function(info) {});
  return connection.on('debug', function(text) {});
};

exports.rowCountForUpdate = function(test) {
  var config, connection, request, setupSql;
  test.expect(2);
  config = getConfig();
  setupSql = "create table #tab1 (id int, name nvarchar(10));\ninsert into #tab1 values(1, N'a1');\ninsert into #tab1 values(2, N'a2');\ninsert into #tab1 values(3, N'b1');\nupdate #tab1 set name = 'a3' where name like 'a%'";
  request = new Request(setupSql, function(err, rowCount) {
    test.ifError(err);
    test.strictEqual(rowCount, 5);
    return connection.close();
  });
  connection = new Connection(config);
  connection.on('connect', function(err) {
    return connection.execSql(request);
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('infoMessage', function(info) {});
  return connection.on('debug', function(text) {});
};

exports.rowCollectionOnRequestCompletion = function(test) {
  var config, connection, request;
  test.expect(5);
  config = getConfig();
  config.options.rowCollectionOnRequestCompletion = true;
  request = new Request('select 1 as a; select 2 as b;', function(err, rowCount, rows) {
    test.strictEqual(rows.length, 2);
    test.strictEqual(rows[0][0].metadata.colName, 'a');
    test.strictEqual(rows[0][0].value, 1);
    test.strictEqual(rows[1][0].metadata.colName, 'b');
    test.strictEqual(rows[1][0].value, 2);
    return connection.close();
  });
  connection = new Connection(config);
  connection.on('connect', function(err) {
    return connection.execSql(request);
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('infoMessage', function(info) {});
  return connection.on('debug', function(text) {});
};

exports.rowCollectionOnDone = function(test) {
  var config, connection, doneCount, request;
  test.expect(6);
  config = getConfig();
  config.options.rowCollectionOnDone = true;
  doneCount = 0;
  request = new Request('select 1 as a; select 2 as b;', function(err, rowCount, rows) {
    return connection.close();
  });
  request.on('doneInProc', function(rowCount, more, rows) {
    test.strictEqual(rows.length, 1);
    switch (++doneCount) {
      case 1:
        test.strictEqual(rows[0][0].metadata.colName, 'a');
        return test.strictEqual(rows[0][0].value, 1);
      case 2:
        test.strictEqual(rows[0][0].metadata.colName, 'b');
        return test.strictEqual(rows[0][0].value, 2);
    }
  });
  connection = new Connection(config);
  connection.on('connect', function(err) {
    return connection.execSql(request);
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('infoMessage', function(info) {});
  return connection.on('debug', function(text) {});
};

exports.execProcAsSql = function(test) {
  var config, connection, request;
  test.expect(7);
  config = getConfig();
  request = new Request('exec sp_help int', function(err, rowCount) {
    test.ifError(err);
    test.strictEqual(rowCount, 0);
    return connection.close();
  });
  request.on('doneProc', function(rowCount, more, returnStatus) {
    test.ok(!more);
    return test.strictEqual(returnStatus, 0);
  });
  request.on('doneInProc', function(rowCount, more) {
    return test.ok(more);
  });
  request.on('row', function(columns) {
    return test.ok(true);
  });
  connection = new Connection(config);
  connection.on('connect', function(err) {
    return connection.execSql(request);
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('infoMessage', function(info) {});
  return connection.on('debug', function(text) {});
};

exports.resetConnection = function(test) {
  var config, connection, setAnsiNullsOptionOff, testAnsiNullsOption, testAnsiNullsOptionOff, testAnsiNullsOptionOn;
  test.expect(4);
  config = getConfig();
  testAnsiNullsOptionOn = function(callback) {
    return testAnsiNullsOption(true, callback);
  };
  testAnsiNullsOptionOff = function(callback) {
    return testAnsiNullsOption(false, callback);
  };
  testAnsiNullsOption = function(expectedOptionOn, callback) {
    var request;
    request = new Request('select @@options & 32', function(err, rowCount) {
      return callback(err);
    });
    request.on('row', function(columns) {
      var optionOn;
      optionOn = columns[0].value === 32;
      return test.strictEqual(optionOn, expectedOptionOn);
    });
    return connection.execSql(request);
  };
  setAnsiNullsOptionOff = function(callback) {
    var request;
    request = new Request('set ansi_nulls off', function(err, rowCount) {
      return callback(err);
    });
    return connection.execSqlBatch(request);
  };
  connection = new Connection(config);
  connection.on('resetConnection', function() {
    return test.ok(true);
  });
  connection.on('connect', function(err) {
    return async.series([
      testAnsiNullsOptionOn, setAnsiNullsOptionOff, testAnsiNullsOptionOff, function(callback) {
        return connection.reset(function(err) {
          if (connection.config.options.tdsVersion < '7_2') {
            test.ok(true);
          }
          return callback(err);
        });
      }, testAnsiNullsOptionOn, function(callback) {
        connection.close();
        return callback();
      }
    ]);
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('infoMessage', function(info) {});
  return connection.on('debug', function(text) {});
};

exports.cancelRequest = function(test) {
  var config, connection, request;
  test.expect(8);
  config = getConfig();
  request = new Request('select 1 as C1;waitfor delay \'00:00:05\';select 2 as C2', function(err, rowCount, rows) {
    test.strictEqual(err.message, 'Canceled.');
    return connection.close();
  });
  request.on('doneInProc', function(rowCount, more) {
    return test.ok(false);
  });
  request.on('doneProc', function(rowCount, more) {
    test.ok(!rowCount);
    return test.strictEqual(more, false);
  });
  request.on('done', function(rowCount, more, rows) {
    test.ok(!rowCount);
    return test.strictEqual(more, false);
  });
  request.on('columnMetadata', function(columnsMetadata) {
    return test.strictEqual(columnsMetadata.length, 1);
  });
  request.on('row', function(columns) {
    test.strictEqual(columns.length, 1);
    return test.strictEqual(columns[0].value, 1);
  });
  connection = new Connection(config);
  connection.on('connect', function(err) {
    connection.execSql(request);
    return setTimeout(connection.cancel.bind(connection), 2000);
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('infoMessage', function(info) {});
  return connection.on('debug', function(text) {});
};

exports.requestTimeout = function(test) {
  var config, connection, request;
  test.expect(8);
  config = getConfig();
  config.options.requestTimeout = 1000;
  request = new Request('select 1 as C1;waitfor delay \'00:00:05\';select 2 as C2', function(err, rowCount, rows) {
    test.equal(err.message, 'Timeout: Request failed to complete in 1000ms');
    return connection.close();
  });
  request.on('doneInProc', function(rowCount, more) {
    return test.ok(false);
  });
  request.on('doneProc', function(rowCount, more) {
    test.ok(!rowCount);
    return test.strictEqual(more, false);
  });
  request.on('done', function(rowCount, more, rows) {
    test.ok(!rowCount);
    return test.strictEqual(more, false);
  });
  request.on('columnMetadata', function(columnsMetadata) {
    return test.strictEqual(columnsMetadata.length, 1);
  });
  request.on('row', function(columns) {
    test.strictEqual(columns.length, 1);
    return test.strictEqual(columns[0].value, 1);
  });
  connection = new Connection(config);
  connection.on('connect', function(err) {
    return connection.execSql(request);
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('infoMessage', function(info) {});
  return connection.on('debug', function(text) {});
};

runSqlBatch = function(test, config, sql, requestCallback) {
  var connection, request;
  connection = new Connection(config);
  request = new Request(sql, function() {
    requestCallback.apply(this, arguments);
    return connection.close();
  });
  connection.on('connect', function(err) {
    test.ifError(err);
    return connection.execSqlBatch(request);
  });
  return connection.on('end', function(info) {
    return test.done();
  });
};

exports.testAnsiNullDefault = function(test) {
  var sql;
  test.expect(2);
  sql = 'create table #testAnsiNullDefault (id int);\ninsert #testAnsiNullDefault values (null);\ndrop table #testAnsiNullDefault;';
  return runSqlBatch(test, getConfig(), sql, function(err) {
    return test.ifError(err);
  });
};

exports.disableAnsiNullDefault = function(test) {
  var config, sql;
  test.expect(3);
  sql = 'create table #testAnsiNullDefaults (id int);\ninsert #testAnsiNullDefaults values (null);\ndrop table #testAnsiNullDefaults;';
  config = getConfig();
  config.options.enableAnsiNullDefault = false;
  return runSqlBatch(test, config, sql, function(err) {
    test.ok(err instanceof Error);
    return test.strictEqual(err != null ? err.number : void 0, 515);
  });
};
