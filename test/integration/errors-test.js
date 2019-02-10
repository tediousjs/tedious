var Connection = require('../../src/connection');
var Request = require('../../src/request');
var fs = require('fs');

var debug = false;

var config = JSON.parse(
  fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')
).config;
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

config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;

exports.uniqueConstraint = function(test) {
  var sql = `\
create table #testUnique (id int unique);
insert #testUnique values (1), (2), (3);
insert #testUnique values (2);
drop table #testUnique;\
`;

  test.expect(3);
  execSql(test, sql, function(err) {
    test.ok(err instanceof Error);
    test.strictEqual(err.number, 2627);
  });
};

exports.nullable = function(test) {
  var sql = `\
create table #testNullable (id int not null);
insert #testNullable values (null);
drop table #testNullable;\
`;

  test.expect(3);
  execSql(test, sql, function(err) {
    test.ok(err instanceof Error);
    test.strictEqual(err.number, 515);
  });
};

exports.cannotDropProcedure = function(test) {
  var sql = '\
drop procedure #nonexistentProcedure;\
';

  test.expect(3);
  execSql(test, sql, function(err) {
    test.ok(err instanceof Error);
    test.strictEqual(err.number, 3701);
  });
};

// Create a temporary stored procedure to test that err.procName,
// err.lineNumber, err.class, and err.state are correct.
//
// We can't really test serverName reliably, other than that it exists.
exports.extendedErrorInfo = function(test) {
  var connection = new Connection(config);

  test.expect(9);

  var execProc = new Request('#testExtendedErrorInfo', function(err) {
    test.ok(err instanceof Error);

    test.strictEqual(err.number, 50000);
    test.strictEqual(err.state, 42, 'err.state wrong');
    test.strictEqual(err.class, 14, 'err.class wrong');

    test.ok(err.serverName != null, 'err.serverName not set');

    // The procedure name will actually be padded to 128 chars with underscores and
    // some random hexadecimal digits.
    test.ok(
      (err.procName != null ?
        err.procName.indexOf('#testExtendedErrorInfo') :
        undefined) === 0,
      `err.procName should begin with #testExtendedErrorInfo, was actually ${err.procName}`
    );
    test.strictEqual(err.lineNumber, 1, 'err.lineNumber should be 1');

    connection.close();
  });

  var createProc = new Request(
    "create procedure #testExtendedErrorInfo as raiserror('test error message', 14, 42)",
    function(err) {
      test.ifError(err);
      connection.callProcedure(execProc);
    }
  );

  connection.on('connect', function(err) {
    test.ifError(err);
    connection.execSqlBatch(createProc);
  });

  connection.on('end', function(info) {
    test.done();
  });

  if (debug) {
    connection.on('debug', function(message) {
      console.log(message);
    });
  }
};

function execSql(test, sql, requestCallback) {
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

  if (debug) {
    connection.on('debug', function(message) {
      console.log(message);
    });
  }
}
