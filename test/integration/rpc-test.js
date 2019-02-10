var Connection = require('../../src/connection');
var Request = require('../../src/request');
var TYPES = require('../../src/data-type').typeByName;
var fs = require('fs');

function getConfig() {
  var config = JSON.parse(
    fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')
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

exports.execProcVarChar = function(test) {
  testProc(test, TYPES.VarChar, 'varchar(10)', 'test');
};

exports.execProcVarCharNull = function(test) {
  testProc(test, TYPES.VarChar, 'varchar(10)', null);
};

exports.execProcNVarChar = function(test) {
  testProc(test, TYPES.NVarChar, 'nvarchar(10)', 'test');
};

exports.execProcNVarCharNull = function(test) {
  testProc(test, TYPES.NVarChar, 'nvarchar(10)', null);
};

exports.execProcTinyInt = function(test) {
  testProc(test, TYPES.TinyInt, 'tinyint', 3);
};

exports.execProcTinyIntNull = function(test) {
  testProc(test, TYPES.TinyInt, 'tinyint', null);
};

exports.execProcSmallInt = function(test) {
  testProc(test, TYPES.SmallInt, 'smallint', 3);
};

exports.execProcSmallIntNull = function(test) {
  testProc(test, TYPES.SmallInt, 'smallint', null);
};

exports.execProcInt = function(test) {
  testProc(test, TYPES.Int, 'int', 3);
};

exports.execProcIntNull = function(test) {
  testProc(test, TYPES.Int, 'int', null);
};

exports.execProcSmallDateTime = function(test) {
  testProc(
    test,
    TYPES.SmallDateTime,
    'smalldatetime',
    new Date('December 4, 2011 10:04:00')
  );
};

exports.execProcSmallDateTimeNull = function(test) {
  testProc(test, TYPES.SmallDateTime, 'smalldatetime', null);
};

exports.execProcDateTime = function(test) {
  testProc(
    test,
    TYPES.DateTime,
    'datetime',
    new Date('December 4, 2011 10:04:23')
  );
};

exports.execProcDateTimeNull = function(test) {
  testProc(test, TYPES.DateTime, 'datetime', null);
};

exports.execProcOutputVarChar = function(test) {
  testProcOutput(test, TYPES.VarChar, 'varchar(10)', 'test');
};

exports.execProcOutputVarCharNull = function(test) {
  testProcOutput(test, TYPES.VarChar, 'varchar(10)', null);
};

exports.execProcOutputNVarChar = function(test) {
  testProcOutput(test, TYPES.NVarChar, 'varchar(10)', 'test');
};

exports.execProcOutputNVarCharNull = function(test) {
  testProcOutput(test, TYPES.NVarChar, 'varchar(10)', null);
};

exports.execProcOutputTinyInt = function(test) {
  testProcOutput(test, TYPES.TinyInt, 'tinyint', 3);
};

exports.execProcOutputTinyIntNull = function(test) {
  testProcOutput(test, TYPES.TinyInt, 'tinyint', null);
};

exports.execProcOutputSmallInt = function(test) {
  testProcOutput(test, TYPES.SmallInt, 'smallint', 3);
};

exports.execProcOutputSmallIntNull = function(test) {
  testProcOutput(test, TYPES.SmallInt, 'smallint', null);
};

exports.execProcOutputInt = function(test) {
  testProcOutput(test, TYPES.Int, 'int', 3);
};

exports.execProcOutputIntNull = function(test) {
  testProcOutput(test, TYPES.Int, 'int', null);
};

exports.execProcOutputSmallDateTime = function(test) {
  testProcOutput(
    test,
    TYPES.SmallDateTime,
    'smalldatetime',
    new Date('December 4, 2011 10:04:00')
  );
};

exports.execProcOutputSmallDateTimeNull = function(test) {
  testProcOutput(test, TYPES.SmallDateTime, 'smalldatetime', null);
};

exports.execProcOutputDateTime = function(test) {
  testProcOutput(
    test,
    TYPES.DateTime,
    'datetime',
    new Date('December 4, 2011 10:04:23')
  );
};

exports.execProcOutputDateTimeNull = function(test) {
  testProcOutput(test, TYPES.DateTime, 'datetime', null);
};

exports.execProcWithBadName = function(test) {
  test.expect(3);

  var config = getConfig();

  var request = new Request('bad_proc_name', function(err) {
    test.ok(err);

    connection.close();
  });

  request.on('doneProc', function(rowCount, more, returnStatus) {
    test.ok(!more);
  });

  request.on('doneInProc', function(rowCount, more) {
    test.ok(more);
  });

  request.on('row', function(columns) {
    test.ok(false);
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    connection.callProcedure(request);
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on(
    'infoMessage',
    function(info) {}
    // console.log("#{info.number} : #{info.message}")
  );

  connection.on('errorMessage', function(error) {
    // console.log("#{error.number} : #{error.message}")
    test.ok(error);
  });

  connection.on(
    'debug',
    function(text) {}
    // console.log(text)
  );
};

exports.procReturnValue = function(test) {
  test.expect(3);

  var config = getConfig();

  var request = new Request('#test_proc', function(err) {
    connection.close();
  });

  request.on('doneProc', function(rowCount, more, returnStatus) {
    test.ok(!more);
    test.strictEqual(returnStatus, -1); // Non-zero indicates a failure.
  });

  request.on('doneInProc', function(rowCount, more) {
    test.ok(more);
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    execSqlBatch(
      test,
      connection,
      '\
CREATE PROCEDURE #test_proc \
AS \
return -1\
',
      function() {
        connection.callProcedure(request);
      }
    );
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on(
    'infoMessage',
    function(info) {}
    // console.log("#{info.number} : #{info.message}")
  );

  connection.on('errorMessage', function(error) {
    // console.log("#{error.number} : #{error.message}")
    test.ok(error);
  });

  connection.on(
    'debug',
    function(text) {}
    // console.log(text)
  );
};

function execSqlBatch(test, connection, sql, doneCallback) {
  var request = new Request(sql, function(err) {
    if (err) {
      console.log(err);
      test.ok(false);
    }

    doneCallback();
  });

  connection.execSqlBatch(request);
}

function testProc(test, type, typeAsString, value) {
  test.expect(5);

  var config = getConfig();

  var request = new Request('#test_proc', function(err) {
    test.ifError(err);

    connection.close();
  });

  request.addParameter('param', type, value);

  request.on('doneProc', function(rowCount, more, returnStatus) {
    test.ok(!more);
    test.strictEqual(returnStatus, 0);
  });

  request.on('doneInProc', function(rowCount, more) {
    test.ok(more);
  });

  request.on('row', function(columns) {
    if (value instanceof Date) {
      test.strictEqual(columns[0].value.getTime(), value.getTime());
    } else {
      test.strictEqual(columns[0].value, value);
    }
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    execSqlBatch(
      test,
      connection,
      `\
CREATE PROCEDURE #test_proc \
@param ${typeAsString} \
AS \
select @param\
`,
      function() {
        connection.callProcedure(request);
      }
    );
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on(
    'infoMessage',
    function(info) {}
    // console.log("#{info.number} : #{info.message}")
  );

  connection.on('errorMessage', function(error) {
    console.log(`${error.number} : ${error.message}`);
  });

  connection.on(
    'debug',
    function(text) {}
    // console.log(text)
  );
}

function testProcOutput(test, type, typeAsString, value) {
  test.expect(7);

  var config = getConfig();

  var request = new Request('#test_proc', function(err) {
    test.ifError(err);

    connection.close();
  });

  request.addParameter('paramIn', type, value);
  request.addOutputParameter('paramOut', type);

  request.on('doneProc', function(rowCount, more, returnStatus) {
    test.ok(!more);
    test.strictEqual(returnStatus, 0);
  });

  request.on('doneInProc', function(rowCount, more) {
    test.ok(more);
  });

  request.on('returnValue', function(name, returnValue, metadata) {
    test.strictEqual(name, 'paramOut');
    if (value instanceof Date) {
      test.strictEqual(returnValue.getTime(), value.getTime());
    } else {
      test.strictEqual(returnValue, value);
    }
    test.ok(metadata);
  });

  var connection = new Connection(config);

  connection.on('connect', function(err) {
    execSqlBatch(
      test,
      connection,
      `\
CREATE PROCEDURE #test_proc \
@paramIn ${typeAsString}, \
@paramOut ${typeAsString} output \
AS \
set @paramOut = @paramIn\
`,
      function() {
        connection.callProcedure(request);
      }
    );
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('infoMessage', function(info) {
    // console.log("#{info.number} : #{info.message}")
  });

  connection.on('errorMessage', function(error) {
    console.log(`${error.number} : ${error.message}`);
  });

  connection.on('debug', function(text) {
    // console.log(text)
  });
}
