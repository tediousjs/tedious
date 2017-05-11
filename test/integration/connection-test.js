var config, connection;
var async = require('async');
var Connection = require('../../src/connection');
var Request = require('../../src/request');
var fs = require('fs');

/* eslint-disable no-unused-vars */

var getConfig = function() {
  var config = JSON.parse(
    fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')
  ).config;

  config.options.debug = {
    packet: true,
    data: true,
    payload: true,
    token: true,
    log: true
  };

  config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;

  return config;
};

process.on('uncaughtException', function(err) {
  return console.error(err.stack);
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
    return test.ok(err);
  });

  connection.on('end', function(info) {
    return test.done();
  });

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
};

exports.badPort = function(test) {
  var config = getConfig();
  config.options.port = -1;
  config.options.connectTimeout = 200;

  var connection = null;

  test.throws(function() {
    return (connection = new Connection(config));
  });

  return test.done();
};

exports.badCredentials = function(test) {
  test.expect(2);

  var config = getConfig();
  config.password = 'bad-password';

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    test.ok(err);

    return connection.close();
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on(
    'infoMessage',
    function(info) {}
    //console.log("#{info.number} : #{info.message}")
  );

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

    return connection.close();
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on('databaseChange', function(database) {
    return test.strictEqual(database, config.options.database);
  });

  connection.on(
    'infoMessage',
    function(info) {}
    //console.log("#{info.number} : #{info.message}")
  );

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
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

    return connection.close();
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on('databaseChange', function(database) {
    return test.strictEqual(database, config.options.database);
  });

  connection.on(
    'infoMessage',
    function(info) {}
    //console.log("#{info.number} : #{info.message}")
  );

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
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

    return connection.close();
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on(
    'infoMessage',
    function(info) {}
    //console.log("#{info.number} : #{info.message}")
  );

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
};

var DomainCaseEnum = {
  AsIs: 0,
  Lower: 1,
  Upper: 2
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

    return connection.close();
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on(
    'infoMessage',
    function(info) {}
    //console.log("#{info.number} : #{info.message}")
  );

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
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
  test.expect(5);

  var config = getConfig();
  config.options.encrypt = true;

  var connection = new Connection(config);

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

  connection.on(
    'infoMessage',
    function(info) {}
    //console.log("#{info.number} : #{info.message}")
  );

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
};

exports.execSql = function(test) {
  test.expect(7);

  var config = getConfig();

  var request = new Request('select 8 as C1', function(err, rowCount) {
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

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    return connection.execSql(request);
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on(
    'infoMessage',
    function(info) {}
    //console.log("#{info.number} : #{info.message}")
  );

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
};

exports.numericColumnName = function(test) {
  test.expect(5);

  var config = getConfig();
  config.options.useColumnNames = true;

  var request = new Request('select 8 as [123]', function(err, rowCount) {
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

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    return connection.execSql(request);
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on(
    'infoMessage',
    function(info) {}
    //console.log("#{info.number} : #{info.message}")
  );

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
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

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    return connection.execSql(request);
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on(
    'infoMessage',
    function(info) {}
    //console.log("#{info.number} : #{info.message}")
  );

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
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

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    return execSql();
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on(
    'infoMessage',
    function(info) {}
    //console.log("#{info.number} : #{info.message}")
  );

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
};

exports.execSqlWithOrder = function(test) {
  test.expect(10);

  var config = getConfig();

  var sql =
    'select top 2 object_id, name, column_id, system_type_id from sys.columns order by name, system_type_id';
  var request = new Request(sql, function(err, rowCount) {
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

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    return connection.execSql(request);
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on(
    'infoMessage',
    function(info) {}
    //console.log("#{info.number} : #{info.message}")
  );

  connection.on(
    'errorMessage',
    function(error) {}
    //console.log("#{error.number} : #{error.message}")
  );

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
};

exports.execSqlMultipleTimes2 = function(test) {
  test.expect(20);

  var requestsToMake = 5;
  var config = getConfig();

  var makeRequest = function() {
    if (requestsToMake === 0) {
      connection.close();
      return;
    }

    var request = new Request('select 8 as C1', function(err, rowCount) {
      test.ifError(err);
      test.strictEqual(rowCount, 1);

      requestsToMake--;
      return makeRequest();
    });

    request.on('doneInProc', function(rowCount, more) {
      return test.strictEqual(rowCount, 1);
      //makeRequest()
    });

    request.on('row', function(columns) {
      return test.strictEqual(columns.length, 1);
    });

    return connection.execSql(request);
  };

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    return makeRequest();
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on(
    'infoMessage',
    function(info) {}
    //console.log("#{info.number} : #{info.message}")
  );

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
};

exports.execBadSql = function(test) {
  test.expect(2);

  var config = getConfig();

  var request = new Request('bad syntax here', function(err) {
    test.ok(err);

    return connection.close();
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    return connection.execSql(request);
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on('errorMessage', function(error) {
    //console.log("#{error.number} : #{error.message}")
    return test.ok(error);
  });

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
};

exports.closeConnectionRequestPending = function(test) {
  test.expect(1);

  var config = getConfig();

  var request = new Request('select 8 as C1', function(err, rowCount) {
    test.ok(err);
    return test.strictEqual(err.code, 'ECLOSE');
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    test.ifError(err);
    connection.execSql(request);

    // This should trigger request callback with error as there is
    // request pending now.
    return connection.close();
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on(
    'infoMessage',
    function(info) {}
    //console.log("#{info.number} : #{info.message}")
  );

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
};

exports.sqlWithMultipleResultSets = function(test) {
  test.expect(8);

  var config = getConfig();
  var row = 0;

  var request = new Request('select 1; select 2;', function(err, rowCount) {
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

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    return connection.execSql(request);
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on(
    'infoMessage',
    function(info) {}
    //console.log("#{info.number} : #{info.message}")
  );

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
};

exports.rowCountForUpdate = function(test) {
  test.expect(2);

  var config = getConfig();
  var row = 0;

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
    return connection.close();
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    return connection.execSql(request);
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on(
    'infoMessage',
    function(info) {}
    //console.log("#{info.number} : #{info.message}")
  );

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
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

    return connection.close();
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    return connection.execSql(request);
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on(
    'infoMessage',
    function(info) {}
    //console.log("#{info.number} : #{info.message}")
  );

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
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

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    return connection.execSql(request);
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on(
    'infoMessage',
    function(info) {}
    //console.log("#{info.number} : #{info.message}")
  );

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
};

exports.execProcAsSql = function(test) {
  test.expect(7);

  var config = getConfig();

  var request = new Request('exec sp_help int', function(err, rowCount) {
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

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    return connection.execSql(request);
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on(
    'infoMessage',
    function(info) {}
    //console.log("#{info.number} : #{info.message}")
  );

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
};

exports.resetConnection = function(test) {
  test.expect(4);

  var config = getConfig();

  var testAnsiNullsOptionOn = function(callback) {
    return testAnsiNullsOption(true, callback);
  };

  var testAnsiNullsOptionOff = function(callback) {
    return testAnsiNullsOption(false, callback);
  };

  var testAnsiNullsOption = function(expectedOptionOn, callback) {
    var request = new Request('select @@options & 32', function(err, rowCount) {
      return callback(err);
    });

    request.on('row', function(columns) {
      var optionOn = columns[0].value === 32;
      return test.strictEqual(optionOn, expectedOptionOn);
    });

    return connection.execSql(request);
  };

  var setAnsiNullsOptionOff = function(callback) {
    var request = new Request('set ansi_nulls off', function(err, rowCount) {
      return callback(err);
    });

    return connection.execSqlBatch(request);
  };

  var connection = new Connection(config);

  connection.on('resetConnection', function() {
    return test.ok(true);
  });

  connection.on('connect', function(err) {
    return async.series([
      testAnsiNullsOptionOn,
      setAnsiNullsOptionOff,
      testAnsiNullsOptionOff,
      function(callback) {
        return connection.reset(function(err) {
          if (connection.config.options.tdsVersion < '7_2') {
            // TDS 7_1 doesnt send RESETCONNECTION acknowledgement packet
            test.ok(true);
          }

          return callback(err);
        });
      },
      testAnsiNullsOptionOn,
      function(callback) {
        connection.close();
        return callback();
      }
    ]);
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on(
    'infoMessage',
    function(info) {}
    //console.log("#{info.number} : #{info.message}")
  );

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
};

exports.cancelRequest = function(test) {
  test.expect(8);

  var config = getConfig();

  var request = new Request(
    "select 1 as C1;waitfor delay '00:00:05';select 2 as C2",
    function(err, rowCount, rows) {
      test.strictEqual(err.message, 'Canceled.');

      return connection.close();
    }
  );

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

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    connection.execSql(request);
    return setTimeout(connection.cancel.bind(connection), 2000);
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on(
    'infoMessage',
    function(info) {}
    //console.log("#{info.number} : #{info.message}")
  );

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
};

exports.requestTimeout = function(test) {
  test.expect(8);

  var config = getConfig();
  config.options.requestTimeout = 1000;

  var request = new Request(
    "select 1 as C1;waitfor delay '00:00:05';select 2 as C2",
    function(err, rowCount, rows) {
      test.equal(err.message, 'Timeout: Request failed to complete in 1000ms');

      return connection.close();
    }
  );

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

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    return connection.execSql(request);
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on(
    'infoMessage',
    function(info) {}
    //console.log("#{info.number} : #{info.message}")
  );

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
};

var runSqlBatch = function(test, config, sql, requestCallback) {
  var connection = new Connection(config);

  var request = new Request(sql, function() {
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

// Test that the default behavior allows adding null values to a
// temporary table where the nullability is not explicitly declared.
exports.testAnsiNullDefault = function(test) {
  test.expect(2);

  var sql = `\
create table #testAnsiNullDefault (id int);
insert #testAnsiNullDefault values (null);
drop table #testAnsiNullDefault;\
`;

  return runSqlBatch(test, getConfig(), sql, function(err) {
    return test.ifError(err);
  });
};

// Test that the default behavior can be overridden (so that temporary
// table columns are non-nullable by default).
exports.disableAnsiNullDefault = function(test) {
  test.expect(3);

  var sql = `\
create table #testAnsiNullDefaults (id int);
insert #testAnsiNullDefaults values (null);
drop table #testAnsiNullDefaults;\
`;

  var config = getConfig();
  config.options.enableAnsiNullDefault = false;

  return runSqlBatch(test, config, sql, function(err) {
    test.ok(err instanceof Error);
    return test.strictEqual(err != null ? err.number : undefined, 515);
  }); // Cannot insert the value NULL
};

var testArithAbort = function(test, setting) {
  test.expect(5);
  var config = getConfig();
  if (typeof setting === 'boolean') {
    config.options.enableArithAbort = setting;
  }

  var request = new Request(
    "SELECT SESSIONPROPERTY('ARITHABORT') AS ArithAbortSetting",
    function(err, rowCount) {
      test.ifError(err);
      test.strictEqual(rowCount, 1);

      return connection.close();
    }
  );

  request.on('columnMetadata', function(columnsMetadata) {
    return test.strictEqual(Object.keys(columnsMetadata).length, 1);
  });

  request.on('row', function(columns) {
    test.strictEqual(Object.keys(columns).length, 1);
    // The current ARITHABORT default setting in Tedious is OFF
    return test.strictEqual(columns[0].value, setting === true ? 1 : 0);
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    return connection.execSql(request);
  });

  return connection.on('end', function(info) {
    return test.done();
  });
};

exports.testArithAbortDefault = function(test) {
  return testArithAbort(test, undefined);
};

exports.testArithAbortOn = function(test) {
  return testArithAbort(test, true);
};

exports.testArithAbortOff = function(test) {
  return testArithAbort(test, false);
};

exports.badArithAbort = function(test) {
  var config = getConfig();
  config.options.enableArithAbort = 'on';

  var connection = null;

  test.throws(function() {
    return (connection = new Connection(config));
  });

  return test.done();
};

var testDateFirstImpl = (test, datefirst) => {
  datefirst = datefirst || 7;
  test.expect(3);
  config = getConfig();
  config.options.datefirst = datefirst;

  connection = new Connection(config);

  var request = new Request('select @@datefirst', function(err) {
    test.ifError(err);
    return connection.close();
  });

  request.on('row', function(columns) {
    var dateFirstActual = columns[0].value;
    return test.strictEqual(dateFirstActual, datefirst);
  });

  connection.on('connect', function(err) {
    test.ifError(err);
    return connection.execSql(request);
  });

  return connection.on('end', function(info) {
    return test.done();
  });
};

// Test that the default setting for DATEFIRST is 7
exports.testDatefirstDefault = function(test) {
  return testDateFirstImpl(test, undefined);
};

// Test that the DATEFIRST setting can be changed via an optional configuration
exports.testDatefirstCustom = function(test) {
  return testDateFirstImpl(test, 3);
};

// Test that an invalid DATEFIRST setting throws
exports.badDatefirst = function(test) {
  test.expect(1);
  config = getConfig();
  config.options.datefirst = -1;

  connection = null;

  test.throws(function() {
    return (connection = new Connection(config));
  });

  return test.done();
};
