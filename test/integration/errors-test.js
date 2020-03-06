const Connection = require('../../src/connection');
const Request = require('../../src/request');
const fs = require('fs');
const assert = require('chai').assert;
const debug = false;

const config = JSON.parse(
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

function execSql(done, sql, requestCallback) {
  const connection = new Connection(config);

  const request = new Request(sql, function() {
    requestCallback.apply(this, arguments);
    connection.close();
  });

  connection.on('connect', function(err) {
    if (err) {
      return done(err);
    }

    connection.execSqlBatch(request);
  });

  connection.on('end', function(info) {
    done();
  });

  if (debug) {
    connection.on('debug', function(message) {
      console.log(message);
    });
  }
}

describe('Errors Test', function() {
  it('should test unique constraints', function(done) {
    const sql = `\
  create table #testUnique (id int unique);
  insert #testUnique values (1), (2), (3);
  insert #testUnique values (2);
  drop table #testUnique;\
  `;

    execSql(done, sql, function(err) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.number, 2627);
    });
  });

  it('should test nullabe', function(done) {
    const sql = `\
  create table #testNullable (id int not null);
  insert #testNullable values (null);
  drop table #testNullable;\
  `;

    execSql(done, sql, function(err) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.number, 515);
    });
  });

  it('should test', function(done) {
    const sql = '\
  drop procedure #nonexistentProcedure;\
  ';

    execSql(done, sql, function(err) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.number, 3701);
    });
  });


  // Create a temporary stored procedure to test that err.procName,
  // err.lineNumber, err.class, and err.state are correct.
  //
  // We can't really test serverName reliably, other than that it exists.
  it('should test extended error info', function(done) {
    const connection = new Connection(config);

    const execProc = new Request('#testExtendedErrorInfo', function(err) {
      assert.ok(err instanceof Error);

      assert.strictEqual(err.number, 50000);
      assert.strictEqual(err.state, 42, 'err.state wrong');
      assert.strictEqual(err.class, 14, 'err.class wrong');

      assert.ok(err.serverName != null, 'err.serverName not set');

      // The procedure name will actually be padded to 128 chars with underscores and
      // some random hexadecimal digits.
      assert.ok(
        (err.procName != null ?
          err.procName.indexOf('#testExtendedErrorInfo') :
          undefined) === 0,
        `err.procName should begin with #testExtendedErrorInfo, was actually ${err.procName}`
      );
      assert.strictEqual(err.lineNumber, 1, 'err.lineNumber should be 1');

      connection.close();
    });

    const createProc = new Request(
      "create procedure #testExtendedErrorInfo as raiserror('test error message', 14, 42)",
      function(err) {
        if (err) {
          return done(err);
        }

        connection.callProcedure(execProc);
      }
    );

    connection.on('connect', function(err) {
      if (err) {
        return done(err);
      }

      connection.execSqlBatch(createProc);
    });

    connection.on('end', function(info) {
      done();
    });

    if (debug) {
      connection.on('debug', function(message) {
        console.log(message);
      });
    }
  });

  it('should support cancelling after starting query execution', function(done) {
    const connection = new Connection(config);

    const request = new Request("select 42, 'hello world'", function(err, rowCount) {
      if (err) {
        assert.equal(err.message, 'Canceled.');
      }
      connection.close();
    });

    connection.on('connect', function(err) {
      if (err) {
        return done(err);
      }

      connection.execSql(request);
      connection.cancel();
    });

    connection.on('end', function(info) {
      done();
    });
  });
});
