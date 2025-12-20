import { assert } from 'chai';
import { RequestError } from '../../src/errors';
import Connection from '../../src/connection';
import Request from '../../src/request';
import { debugOptionsFromEnv } from '../helpers/debug-options-from-env';
import defaultConfig from '../config';

const config = {
  ...defaultConfig,
  options: {
    ...defaultConfig.options,
    textsize: 8 * 1024,
    debug: debugOptionsFromEnv(),
    tdsVersion: process.env.TEDIOUS_TDS_VERSION
  }
};

function execSql(done: Mocha.Done, sql: string | undefined, requestCallback: (error: Error | null | undefined, rowCount?: number, rows?: any) => void) {
  const connection = new Connection(config);

  const request = new Request(sql, function(err) {
    requestCallback(err);
    connection.close();
  });

  connection.connect(function(err) {
    if (err) {
      return done(err);
    }

    connection.execSqlBatch(request);
  });

  connection.on('end', function() {
    done();
  });

  if (process.env.TEDIOUS_DEBUG) {
    connection.on('debug', console.log);
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
      assert.instanceOf(err, RequestError);
      assert.strictEqual((err as RequestError).number, 2627);
    });
  });

  it('should test nullabe', function(done) {
    const sql = `\
  create table #testNullable (id int not null);
  insert #testNullable values (null);
  drop table #testNullable;\
  `;

    execSql(done, sql, function(err) {
      assert.instanceOf(err, RequestError);
      assert.strictEqual((err as RequestError).number, 515);
    });
  });

  it('should test', function(done) {
    const sql = '\
  drop procedure #nonexistentProcedure;\
  ';

    execSql(done, sql, function(err) {
      assert.instanceOf(err, RequestError);
      assert.strictEqual((err as RequestError).number, 3701);
    });
  });


  // Create a temporary stored procedure to test that err.procName,
  // err.lineNumber, err.class, and err.state are correct.
  //
  // We can't really test serverName reliably, other than that it exists.
  it('should test extended error info', function(done) {
    const connection = new Connection(config);

    const execProc = new Request('#testExtendedErrorInfo', function(err) {
      if (!err) {
        assert.fail('Expected `err` to not be undefined');
      }

      const requestError = err as RequestError;

      assert.strictEqual(requestError.number, 50000);
      assert.strictEqual(requestError.state, 42);
      assert.strictEqual(requestError.class, 14);

      assert.exists(requestError.serverName);
      assert.exists(requestError.procName);

      // The procedure name will actually be padded to 128 chars with underscores and
      // some random hexadecimal digits.
      assert.match(requestError.procName as string, /^#testExtendedErrorInfo/);

      assert.strictEqual(requestError.lineNumber, 1);

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

    connection.connect(function(err) {
      if (err) {
        return done(err);
      }

      connection.execSqlBatch(createProc);
    });

    connection.on('end', function() {
      done();
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  });

  it('should support cancelling after starting query execution', function(done) {
    const connection = new Connection(config);

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    const request = new Request("select 42, 'hello world'", function(err) {
      if (err) {
        assert.equal(err.message, 'Canceled.');
      }
      connection.close();
    });

    connection.connect(function(err) {
      if (err) {
        return done(err);
      }

      connection.execSql(request);
      connection.cancel();
    });

    connection.on('end', function() {
      done();
    });
  });

  it('should throw aggregate error with two error messages', function(done) {
    const connection = new Connection(config);

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    connection.connect((err) => {
      if (err) {
        return done(err);
      }

      const request = new Request('create type test_type as table ( id int, primary key (code) );', (error) => {
        assert.instanceOf(error, AggregateError);

        if (error instanceof AggregateError) {
          assert.strictEqual(error.errors.length, 2);
          assert.match(error.errors[0].message, /^Column name 'code' does not exist in the target table(, index)? or view\.$/);
          assert.strictEqual(error.errors[1].message, 'Could not create constraint or index. See previous errors.');
        }

        connection.close();
      });

      connection.execSql(request);
    });

    connection.on('end', function() {
      done();
    });
  });

  it.skip('should throw aggregate error with AAD token retrieve', function(done) {
    const testConfig: any = {
      ...config,
      server: 'help.kusto.windows.net',
      authentication: {
        type: 'azure-active-directory-password',
        options: {
          userName: 'username',
          password: 'password',
          // Lack of tenantId will generate a AAD token retrieve error
          clientId: 'clientID',
        }
      },
      options: {
        ...config.options,
        tdsVersion: '7_4'
      }
    };
    const connection = new Connection(testConfig);

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    let connectionError: Error | undefined;
    connection.connect((err) => {
      connectionError = err;

      assert.instanceOf(connectionError, AggregateError);

      if (connectionError instanceof AggregateError) {
        assert.strictEqual(connectionError.errors.length, 2);
        assert.strictEqual(connectionError.errors[0].message, 'Security token could not be authenticated or authorized.');
        assert.include(connectionError.errors[1].message, 'The grant type is not supported over the /common or /consumers endpoints.');
      }

      done();
    });
  });
});
