'use strict';

var Connection, Request, TYPES, execSqlBatch, fs, getConfig, testProc, testProcOutput;

Connection = require('../../src/connection');

Request = require('../../src/request');

TYPES = require('../../src/data-type').typeByName;

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

exports.execProcVarChar = function(test) {
  return testProc(test, TYPES.VarChar, 'varchar(10)', 'test');
};

exports.execProcVarCharNull = function(test) {
  return testProc(test, TYPES.VarChar, 'varchar(10)', null);
};

exports.execProcNVarChar = function(test) {
  return testProc(test, TYPES.NVarChar, 'nvarchar(10)', 'test');
};

exports.execProcNVarCharNull = function(test) {
  return testProc(test, TYPES.NVarChar, 'nvarchar(10)', null);
};

exports.execProcTinyInt = function(test) {
  return testProc(test, TYPES.TinyInt, 'tinyint', 3);
};

exports.execProcTinyIntNull = function(test) {
  return testProc(test, TYPES.TinyInt, 'tinyint', null);
};

exports.execProcSmallInt = function(test) {
  return testProc(test, TYPES.SmallInt, 'smallint', 3);
};

exports.execProcSmallIntNull = function(test) {
  return testProc(test, TYPES.SmallInt, 'smallint', null);
};

exports.execProcInt = function(test) {
  return testProc(test, TYPES.Int, 'int', 3);
};

exports.execProcIntNull = function(test) {
  return testProc(test, TYPES.Int, 'int', null);
};

exports.execProcSmallDateTime = function(test) {
  return testProc(test, TYPES.SmallDateTime, 'smalldatetime', new Date('December 4, 2011 10:04:00'));
};

exports.execProcSmallDateTimeNull = function(test) {
  return testProc(test, TYPES.SmallDateTime, 'smalldatetime', null);
};

exports.execProcDateTime = function(test) {
  return testProc(test, TYPES.DateTime, 'datetime', new Date('December 4, 2011 10:04:23'));
};

exports.execProcDateTimeNull = function(test) {
  return testProc(test, TYPES.DateTime, 'datetime', null);
};

exports.execProcOutputVarChar = function(test) {
  return testProcOutput(test, TYPES.VarChar, 'varchar(10)', 'test');
};

exports.execProcOutputVarCharNull = function(test) {
  return testProcOutput(test, TYPES.VarChar, 'varchar(10)', null);
};

exports.execProcOutputNVarChar = function(test) {
  return testProcOutput(test, TYPES.NVarChar, 'varchar(10)', 'test');
};

exports.execProcOutputNVarCharNull = function(test) {
  return testProcOutput(test, TYPES.NVarChar, 'varchar(10)', null);
};

exports.execProcOutputTinyInt = function(test) {
  return testProcOutput(test, TYPES.TinyInt, 'tinyint', 3);
};

exports.execProcOutputTinyIntNull = function(test) {
  return testProcOutput(test, TYPES.TinyInt, 'tinyint', null);
};

exports.execProcOutputSmallInt = function(test) {
  return testProcOutput(test, TYPES.SmallInt, 'smallint', 3);
};

exports.execProcOutputSmallIntNull = function(test) {
  return testProcOutput(test, TYPES.SmallInt, 'smallint', null);
};

exports.execProcOutputInt = function(test) {
  return testProcOutput(test, TYPES.Int, 'int', 3);
};

exports.execProcOutputIntNull = function(test) {
  return testProcOutput(test, TYPES.Int, 'int', null);
};

exports.execProcOutputSmallDateTime = function(test) {
  return testProcOutput(test, TYPES.SmallDateTime, 'smalldatetime', new Date('December 4, 2011 10:04:00'));
};

exports.execProcOutputSmallDateTimeNull = function(test) {
  return testProcOutput(test, TYPES.SmallDateTime, 'smalldatetime', null);
};

exports.execProcOutputDateTime = function(test) {
  return testProcOutput(test, TYPES.DateTime, 'datetime', new Date('December 4, 2011 10:04:23'));
};

exports.execProcOutputDateTimeNull = function(test) {
  return testProcOutput(test, TYPES.DateTime, 'datetime', null);
};

exports.execProcWithBadName = function(test) {
  var config, connection, request;
  test.expect(3);
  config = getConfig();
  request = new Request('bad_proc_name', function(err) {
    test.ok(err);
    return connection.close();
  });
  request.on('doneProc', function(rowCount, more, returnStatus) {
    return test.ok(!more);
  });
  request.on('doneInProc', function(rowCount, more) {
    return test.ok(more);
  });
  request.on('row', function(columns) {
    return test.ok(false);
  });
  connection = new Connection(config);
  connection.on('connect', function(err) {
    return connection.callProcedure(request);
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('infoMessage', function(info) {});
  connection.on('errorMessage', function(error) {
    return test.ok(error);
  });
  return connection.on('debug', function(text) {});
};

exports.procReturnValue = function(test) {
  var config, connection, request;
  test.expect(3);
  config = getConfig();
  request = new Request('#test_proc', function(err) {
    return connection.close();
  });
  request.on('doneProc', function(rowCount, more, returnStatus) {
    test.ok(!more);
    return test.strictEqual(returnStatus, -1);
  });
  request.on('doneInProc', function(rowCount, more) {
    return test.ok(more);
  });
  connection = new Connection(config);
  connection.on('connect', function(err) {
    return execSqlBatch(test, connection, 'CREATE PROCEDURE #test_proc AS return -1', function() {
      return connection.callProcedure(request);
    });
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('infoMessage', function(info) {});
  connection.on('errorMessage', function(error) {
    return test.ok(error);
  });
  return connection.on('debug', function(text) {});
};

execSqlBatch = function(test, connection, sql, doneCallback) {
  var request;
  request = new Request(sql, function(err) {
    if (err) {
      console.log(err);
      test.ok(false);
    }
    return doneCallback();
  });
  return connection.execSqlBatch(request);
};

testProc = function(test, type, typeAsString, value) {
  var config, connection, request;
  test.expect(5);
  config = getConfig();
  request = new Request('#test_proc', function(err) {
    test.ifError(err);
    return connection.close();
  });
  request.addParameter('param', type, value);
  request.on('doneProc', function(rowCount, more, returnStatus) {
    test.ok(!more);
    return test.strictEqual(returnStatus, 0);
  });
  request.on('doneInProc', function(rowCount, more) {
    return test.ok(more);
  });
  request.on('row', function(columns) {
    if (value instanceof Date) {
      return test.strictEqual(columns[0].value.getTime(), value.getTime());
    } else {
      return test.strictEqual(columns[0].value, value);
    }
  });
  connection = new Connection(config);
  connection.on('connect', function(err) {
    return execSqlBatch(test, connection, 'CREATE PROCEDURE #test_proc @param ' + typeAsString + ' AS select @param', function() {
      return connection.callProcedure(request);
    });
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('infoMessage', function(info) {});
  connection.on('errorMessage', function(error) {
    return console.log(error.number + ' : ' + error.message);
  });
  return connection.on('debug', function(text) {});
};

testProcOutput = function(test, type, typeAsString, value) {
  var config, connection, request;
  test.expect(7);
  config = getConfig();
  request = new Request('#test_proc', function(err) {
    test.ifError(err);
    return connection.close();
  });
  request.addParameter('paramIn', type, value);
  request.addOutputParameter('paramOut', type);
  request.on('doneProc', function(rowCount, more, returnStatus) {
    test.ok(!more);
    return test.strictEqual(returnStatus, 0);
  });
  request.on('doneInProc', function(rowCount, more) {
    return test.ok(more);
  });
  request.on('returnValue', function(name, returnValue, metadata) {
    test.strictEqual(name, 'paramOut');
    if (value instanceof Date) {
      test.strictEqual(returnValue.getTime(), value.getTime());
    } else {
      test.strictEqual(returnValue, value);
    }
    return test.ok(metadata);
  });
  connection = new Connection(config);
  connection.on('connect', function(err) {
    return execSqlBatch(test, connection, 'CREATE PROCEDURE #test_proc @paramIn ' + typeAsString + ', @paramOut ' + typeAsString + ' output AS set @paramOut = @paramIn', function() {
      return connection.callProcedure(request);
    });
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('infoMessage', function(info) {});
  connection.on('errorMessage', function(error) {
    return console.log(error.number + ' : ' + error.message);
  });
  return connection.on('debug', function(text) {});
};
