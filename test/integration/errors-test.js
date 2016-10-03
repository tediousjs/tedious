'use strict';

var Connection, Request, config, debug, execSql, fs;

Connection = require('../../src/connection');

Request = require('../../src/request');

fs = require('fs');

debug = false;

config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config;

config.options.textsize = 8 * 1024;

if (debug) {
  config.options.debug = {
    packet: true,
    data: true,
    payload: true,
    token: true,
    log: true
  };
} else {
  config.options.debug = {};
}

exports.uniqueConstraint = function(test) {
  var sql;
  sql = 'create table #testUnique (id int unique);\ninsert #testUnique values (1), (2), (3);\ninsert #testUnique values (2);\ndrop table #testUnique;';
  test.expect(3);
  return execSql(test, sql, function(err) {
    test.ok(err instanceof Error);
    return test.strictEqual(err.number, 2627);
  });
};

exports.nullable = function(test) {
  var sql;
  sql = 'create table #testNullable (id int not null);\ninsert #testNullable values (null);\ndrop table #testNullable;';
  test.expect(3);
  return execSql(test, sql, function(err) {
    test.ok(err instanceof Error);
    return test.strictEqual(err.number, 515);
  });
};

exports.cannotDropProcedure = function(test) {
  var sql;
  sql = 'drop procedure #nonexistentProcedure;';
  test.expect(3);
  return execSql(test, sql, function(err) {
    test.ok(err instanceof Error);
    return test.strictEqual(err.number, 3701);
  });
};

exports.extendedErrorInfo = function(test) {
  var connection, createProc, execProc;
  connection = new Connection(config);
  test.expect(9);
  execProc = new Request('#testExtendedErrorInfo', function(err) {
    var ref;
    test.ok(err instanceof Error);
    test.strictEqual(err.number, 50000);
    test.strictEqual(err.state, 42, 'err.state wrong');
    test.strictEqual(err['class'], 14, 'err.class wrong');
    test.ok(err.serverName != null, 'err.serverName not set');
    test.ok(((ref = err.procName) != null ? ref.indexOf('#testExtendedErrorInfo') : void 0) === 0, 'err.procName should begin with #testExtendedErrorInfo, was actually ' + err.procName);
    test.strictEqual(err.lineNumber, 1, 'err.lineNumber should be 1');
    return connection.close();
  });
  createProc = new Request("create procedure #testExtendedErrorInfo as raiserror('test error message', 14, 42)", function(err) {
    test.ifError(err);
    return connection.callProcedure(execProc);
  });
  connection.on('connect', function(err) {
    test.ifError(err);
    return connection.execSqlBatch(createProc);
  });
  connection.on('end', function(info) {
    return test.done();
  });
  if (debug) {
    return connection.on('debug', function(message) {
      return console.log(message);
    });
  }
};

execSql = function(test, sql, requestCallback) {
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
  connection.on('end', function(info) {
    return test.done();
  });
  if (debug) {
    return connection.on('debug', function(message) {
      return console.log(message);
    });
  }
};
