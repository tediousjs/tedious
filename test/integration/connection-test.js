// @ts-check

const async = require('async');
const assert = require('chai').assert;
const os = require('os');

import Connection from '../../src/connection';
import { ConnectionError, RequestError } from '../../src/errors';
import Request from '../../src/request';
import { versions } from '../../src/tds-versions';
import { debugOptionsFromEnv } from '../helpers/debug-options-from-env';

import defaultConfig from '../config';

function getConfig() {
  const config = {
    ...defaultConfig,
    options: {
      ...defaultConfig.options,
      debug: debugOptionsFromEnv(),
      tdsVersion: process.env.TEDIOUS_TDS_VERSION,
    }
  };

  return config;
}

describe('Initiate Connect Test', function() {
  this.timeout(20000);

  it('should be bad server', function(done) {
    const config = getConfig();
    config.server = 'bad-server';

    const connection = new Connection(config);

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    connection.connect(function(err) {
      assert.instanceOf(err, Error);

      done();
    });
  });

  it('should be bad port', function(done) {
    const config = getConfig();

    assert.throws(function() {
      new Connection({
        ...config,
        options: {
          ...config.options,
          port: -1,
          connectTimeout: 200
        }
      });
    });

    done();
  });

  it('should be bad credentials', function(done) {
    const config = getConfig();

    if (config.authentication && config.authentication.type !== 'default') {
      return done();
    }

    const connection = new Connection({
      ...config,
      authentication: {
        ...config.authentication,
        options: {
          ...config.authentication?.options,
          userName: 'bad-user',
          password: 'bad-password'
        }
      }
    });

    connection.on('end', function() {
      done();
    });

    connection.on('infoMessage', function(info) {
      // console.log("#{info.number} : #{info.message}")
    });

    connection.on('errorMessage', function(error) {
      // console.log(`${error.number} : ${error.message}`)
      return assert.ok(~error.message.indexOf('failed') || ~error.message.indexOf('登录失败'));
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    connection.connect(function(err) {
      assert.ok(err);

      connection.close();
    });
  });

  it('should connect by port', function(done) {
    const config = getConfig();

    if ((config.options != null ? config.options.port : undefined) == null) {
      // Config says don't do this test (probably because ports are dynamic).
      return this.skip();
    }

    const connection = new Connection(config);

    connection.connect(function(err) {
      assert.ifError(err);

      connection.close();
    });

    connection.on('end', function() {
      done();
    });

    connection.on('databaseChange', function(database) {
      if (config.options?.database) {
        assert.strictEqual(database, config.options.database);
      }
    });

    connection.on('infoMessage', function(info) {
      // console.log("#{info.number} : #{info.message}")
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  });

  it('should fail connecting by invalid instance name', function(done) {
    const config = getConfig();

    if (!config.options?.instanceName) {
      // Config says don't do this test (probably because SQL Server Browser is not available).
      return this.skip();
    }

    const connection = new Connection({
      ...config,
      options: {
        ...config.options,
        port: undefined,
        instanceName: `${config.options.instanceName}X`
      }
    });

    connection.connect(function(err) {
      assert.ok(err);

      connection.close();
    });

    connection.on('end', function() {
      done();
    });

    connection.on('infoMessage', function(info) {
      // console.log("#{info.number} : #{info.message}")
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  });

  it('should allow connecting by calling `.connect` on the returned connection', function(done) {
    const config = getConfig();

    const connection = new Connection(config);
    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
    connection.connect((err) => {
      if (err) {
        return done(err);
      }

      connection.on('end', () => { done(); });
      connection.close();
    });
  });

  it('should not allow calling `.connect` on a connected connection', function(done) {
    const config = getConfig();

    const connection = new Connection(config);
    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
    connection.connect((err) => {
      if (err) {
        return done(err);
      }

      connection.on('end', () => { done(); });
      process.nextTick(() => {
        connection.close();
      });

      assert.throws(() => {
        connection.connect();
      }, '`.connect` can not be called on a Connection in `LoggedIn` state.');
    });
  });

  it('should allow calling `.connect` without a callback', function(done) {
    const config = getConfig();

    const connection = new Connection(config);
    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
    connection.on('connect', (err) => {
      if (err) {
        return done(err);
      }

      connection.on('end', () => { done(); });
      connection.close();
    });
    connection.connect();
  });

  it('should clear timeouts when failing to connect', function(done) {
    const connection = new Connection({
      server: 'something.invalid',
      options: { connectTimeout: 30000 },
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    connection.on('connect', (err) => {
      try {
        assert.instanceOf(err, ConnectionError);
        assert.strictEqual(/** @type {ConnectionError} */(err).code, 'ESOCKET');
        assert.strictEqual(connection.connectTimer, undefined);
        done();
      } catch (e) {
        done(e);
      }
    });

    connection.on('error', done);
    connection.connect();

    assert.isOk(connection.connectTimer);
  });

  it('should clear timeouts when failing to connect to named instance', function(done) {
    const connection = new Connection({
      server: 'something.invalid',
      options: {
        instanceName: 'inst',
        connectTimeout: 30000,
      },
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    connection.on('connect', (err) => {
      assert.instanceOf(err, ConnectionError);
      assert.strictEqual(/** @type {ConnectionError} */(err).code, 'EINSTLOOKUP');
      assert.strictEqual(connection.connectTimer, undefined);

      done();
    });

    connection.on('error', done);
    connection.connect();

    assert.isOk(connection.connectTimer);
  });

  it('should fail if no cipher can be negotiated', function(done) {
    const config = getConfig();

    const connection = new Connection({
      ...config,
      options: {
        ...config.options,
        encrypt: true,
        // Specify a cipher that should never be supported by SQL Server
        cryptoCredentialsDetails: {
          ciphers: 'NULL'
        }
      }
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    connection.connect(function(err) {
      assert.instanceOf(err, ConnectionError);
      assert.strictEqual(/** @type {ConnectionError} */(err).code, 'ESOCKET');
    });

    connection.on('end', function() {
      done();
    });
  });

  it('should use the local hostname as the default workstation identifier', function(done) {
    const config = getConfig();

    const request = new Request('SELECT HOST_NAME()', function(err, rowCount) {
      assert.ifError(err);
      assert.strictEqual(rowCount, 1);

      connection.close();
    });

    request.on('row', function(columns) {
      assert.strictEqual(columns.length, 1);
      assert.strictEqual(columns[0].value, os.hostname());
    });

    let connection = new Connection(config);

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    connection.connect((err) => {
      assert.ifError(err);

      connection.execSql(request);
    });

    connection.on('end', () => {
      done();
    });
  });

  it('should allow specifying a custom workstation identifier', function(done) {
    const config = getConfig();

    const request = new Request('SELECT HOST_NAME()', function(err, rowCount) {
      assert.ifError(err);
      assert.strictEqual(rowCount, 1);

      connection.close();
    });

    request.on('row', function(columns) {
      assert.strictEqual(columns.length, 1);
      assert.strictEqual(columns[0].value, 'foo.bar.baz');
    });

    let connection = new Connection({
      ...config,
      options: {
        ...config.options,
        workstationId: 'foo.bar.baz'
      }
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    connection.connect((err) => {
      assert.ifError(err);

      connection.execSql(request);
    });

    connection.on('end', () => {
      done();
    });
  });

  it('should not emit error after connect timeout', function(done) {
    const config = getConfig();
    const connection = new Connection({
      ...config,
      options: {
        ...config.options,
        connectTimeout: 1
      }
    });
    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
    connection.on('error', (error) => { assert.ifError(error); });
    connection.connect((err) => { });

    setTimeout(() => { done(); }, 500);
  });

  it('should not leave any dangling sockets after connection timeout', function(done) {
    // 192.0.2.0/24 is an IP address block reserved for documentation.
    //
    // Opening a connection to an address in that block should never be successfull
    // and fail after a while with `ETIMEDOUT`.
    //
    // This test is supposed to show that we correctly clean up the socket(s)
    // that got created after the `connectTimeout` was reached and no
    // errors happen at a later time.
    const conn = new Connection({
      server: '192.0.2.1',
      options: {
        connectTimeout: 3000
      }
    });

    if (process.env.TEDIOUS_DEBUG) {
      conn.on('debug', console.log);
    }

    conn.connect((err) => {
      conn.close();

      assert.instanceOf(err, Error);
      assert.strictEqual(/** @type {Error} */(err).message, 'Failed to connect to 192.0.2.1:1433 in 3000ms');

      done();
    });
  });
});


describe('Ntlm Test', function() {
  /**
   * @enum {number}
   */
  const DomainCaseEnum = {
    AsIs: 0,
    Lower: 1,
    Upper: 2,
  };

  /**
   * @this {Mocha.Context}
   * @param {Mocha.Done} done
   * @param {DomainCaseEnum} domainCase
   * @returns {void}
   */
  function runNtlmTest(done, domainCase) {
    let config = getConfig();

    if (config.authentication?.type !== 'ntlm') {
      return this.skip();
    }

    switch (domainCase) {
      case DomainCaseEnum.AsIs:
        break;
      case DomainCaseEnum.Lower:
        config = {
          ...config,
          authentication: {
            ...config.authentication,
            options: {
              ...config.authentication.options,
              domain: /** @type {string} */(config.authentication.options.domain).toLowerCase()
            }
          }
        };

        break;
      case DomainCaseEnum.Upper:
        config = {
          ...config,
          authentication: {
            ...config.authentication,
            options: {
              ...config.authentication.options,
              domain: /** @type {string} */(config.authentication.options.domain).toUpperCase()
            }
          }
        };

        break;
      default:
        assert.ok(false, 'Unexpected value for domainCase: ' + domainCase);
    }

    let row = 0;

    const request = new Request('select 1; select 2;', function(err, rowCount) {
      assert.ifError(err);
      assert.strictEqual(rowCount, 2);

      connection.close();
    });

    request.on('doneInProc', function(rowCount, more) {
      assert.strictEqual(rowCount, 1);
    });

    request.on('columnMetadata', function(columnsMetadata) {
      assert.strictEqual(columnsMetadata.length, 1);
    });

    request.on('row', function(columns) {
      assert.strictEqual(columns[0].value, ++row);
    });

    const connection = new Connection(config);

    connection.connect(function(err) {
      assert.ifError(err);
      connection.execSql(request);
    });

    connection.on('end', function() {
      done();
    });

    connection.on('infoMessage', function(info) {
      // console.log("#{info.number} : #{info.message}")
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  }

  it('should ntlm', function(done) {
    runNtlmTest.call(this, done, DomainCaseEnum.AsIs);
  });

  it('should ntlm lower', function(done) {
    runNtlmTest.call(this, done, DomainCaseEnum.Lower);
  });

  it('should ntlm upper', function(done) {
    runNtlmTest.call(this, done, DomainCaseEnum.Upper);
  });
});

describe('Encrypt Test', function() {
  /**
   * @param {any} config
   * @param {(err: Error | null, supportsTds8?: boolean) => void} callback
   */
  function supportsTds8(config, callback) {
    if (config.options.tdsVersion < '7_2') {
      return callback(null, false);
    }

    const connection = new Connection(config);

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    connection.connect((err) => {
      if (err) {
        return callback(err);
      }

      /**
       * @type {string | undefined}
       */
      let productMajorVersion;
      const request = new Request("SELECT SERVERPROPERTY('ProductMajorVersion')", (err) => {
        if (err) {
          connection.close();
          return callback(err);
        }

        if (!productMajorVersion || productMajorVersion < '16') {
          connection.close();
          return callback(null, false);
        }

        if (productMajorVersion > '16') {
          connection.close();
          return callback(null, true);
        }

        let supportsTds8 = false;
        const request = new Request('SELECT host_platform FROM sys.dm_os_host_info', (err) => {
          connection.close();

          if (err) {
            return callback(err);
          }

          callback(null, supportsTds8);
        });

        request.on('row', (row) => {
          supportsTds8 = row[0].value !== 'Linux';
        });

        connection.execSql(request);
      });

      request.on('row', (row) => {
        productMajorVersion = row[0].value;
      });

      connection.execSql(request);
    });
  }

  describe('with strict encryption enabled (TDS 8.0)', function() {
    /**
     * @type {Connection}
     */
    let connection;

    beforeEach(function(done) {
      const config = getConfig();

      supportsTds8(config, (err, supportsTds8) => {
        if (err) {
          return done(err);
        }

        if (!supportsTds8) {
          return this.skip();
        }

        connection = new Connection({
          ...config,
          options: {
            ...config.options,
            encrypt: 'strict'
          }
        });
        if (process.env.TEDIOUS_DEBUG) {
          connection.on('debug', console.log);
        }
        connection.connect(done);
      });
    });

    afterEach(function() {
      connection && connection.close();
    });

    it('opens an encrypted connection', function(done) {
      const request = new Request(`
        SELECT c.protocol_version, c.encrypt_option
        FROM sys.dm_exec_connections AS c
        WHERE c.session_id = @@SPID
      `, (err, rowCount) => {
        if (err) {
          return done(err);
        }

        assert.ifError(err);
        assert.strictEqual(rowCount, 1);

        done();
      });

      request.on('row', function(columns) {
        assert.strictEqual(columns.length, 2);
        assert.strictEqual(versions['8_0'], columns[0].value);
        assert.strictEqual('TRUE', columns[1].value);
      });

      connection.execSql(request);
    });
  });

  describe('with encryption enabled', function() {
    /**
     * @type {Connection}
     */
    let connection;

    beforeEach(function(done) {
      const config = getConfig();
      connection = new Connection({
        ...config,
        options: {
          ...config.options,
          encrypt: true
        }
      });
      if (process.env.TEDIOUS_DEBUG) {
        connection.on('debug', console.log);
      }
      connection.connect(done);
    });

    afterEach(function() {
      connection.close();
    });

    it('opens an encrypted connection', function(done) {
      const request = new Request(`
        SELECT c.protocol_version, c.encrypt_option
        FROM sys.dm_exec_connections AS c
        WHERE c.session_id = @@SPID
      `, (err, rowCount) => {
        if (err) {
          return done(err);
        }

        assert.ifError(err);
        assert.strictEqual(rowCount, 1);

        done();
      });

      request.on('row', function(columns) {
        assert.strictEqual(columns.length, 2);
        assert.strictEqual(versions[connection.config.options.tdsVersion], columns[0].value);
        assert.strictEqual('TRUE', columns[1].value);
      });

      connection.execSql(request);
    });
  });
});

describe('BeginTransaction Tests', function() {
  /** @type {Connection} */
  let connection;
  beforeEach(function(done) {
    const config = getConfig();
    connection = new Connection(config);
    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
    connection.connect(done);
  });

  afterEach(function(done) {
    if (!connection.closed) {
      connection.on('end', done);
      connection.close();
    } else {
      done();
    }
  });

  it('should validate isolation level is a number', function() {
    assert.throws(() => {
      const callback = () => { assert.fail('callback should not be executed'); };
      connection.beginTransaction(callback, 'test', /** @type {any} */('some string'));
    }, TypeError, 'The "isolationLevel" argument must be of type number. Received type string (some string)');
  });

  it('should validate isolation level is an integer', function() {
    assert.throws(() => {
      const callback = () => { assert.fail('callback should not be executed'); };
      connection.beginTransaction(callback, 'test', 2.3);
    }, RangeError, 'The value of "isolationLevel" is out of range. It must be an integer. Received: 2.3');
  });

  it('should validate isolation level is a valid isolation level value', function() {
    assert.throws(() => {
      const callback = () => { assert.fail('callback should not be executed'); };
      connection.beginTransaction(callback, 'test', 9);
    }, RangeError, 'The value of "isolationLevel" is out of range. It must be >= 0 && <= 5. Received: 9');
  });
});

describe('Insertion Tests', function() {
  this.timeout(30000);

  it('should execSql', function(done) {
    const config = getConfig();

    const request = new Request('select 8 as C1', function(err, rowCount) {
      assert.ifError(err);
      assert.strictEqual(rowCount, 1);

      connection.close();
    });

    request.on('doneInProc', function(rowCount, more) {
      assert.ok(more);
      assert.strictEqual(rowCount, 1);
    });

    request.on('columnMetadata', function(columnsMetadata) {
      assert.strictEqual(columnsMetadata.length, 1);
    });

    request.on('row', function(columns) {
      assert.strictEqual(columns.length, 1);
      assert.strictEqual(columns[0].value, 8);
    });

    let connection = new Connection(config);

    connection.connect(function(err) {
      connection.execSql(request);
    });

    connection.on('end', function() {
      done();
    });

    connection.on('infoMessage', function(info) {
      // console.log("#{info.number} : #{info.message}")
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  });

  describe('when `useColumnNames` is `true`', function() {
    it('should support numeric column names', function(done) {
      const config = getConfig();

      const connection = new Connection({
        ...config,
        options: {
          ...config.options,
          useColumnNames: true
        }
      });

      if (process.env.TEDIOUS_DEBUG) {
        connection.on('debug', console.log);
      }

      connection.connect((err) => {
        if (err) {
          return done(err);
        }

        const request = new Request('select 8 as [123]', (err, rowCount) => {
          assert.ifError(err);
          assert.strictEqual(rowCount, 1);

          connection.close();
        });

        request.on('columnMetadata', (columnsMetadata) => {
          assert.strictEqual(Object.keys(columnsMetadata).length, 1);
        });

        request.on('row', (columns) => {
          assert.strictEqual(Object.keys(columns).length, 1);
          assert.strictEqual(columns[123].value, 8);
        });

        connection.execSql(request);
      });

      connection.on('end', () => {
        done();
      });
    });

    it('supports duplicate column names', function(done) {
      const config = getConfig();

      const connection = new Connection({
        ...config,
        options: {
          ...config.options,
          useColumnNames: true
        }
      });

      if (process.env.TEDIOUS_DEBUG) {
        connection.on('debug', console.log);
      }

      connection.connect((err) => {
        if (err) {
          return done(err);
        }

        const request = new Request("select 1 as abc, 2 as xyz, '3' as abc", (err, rowCount) => {
          assert.ifError(err);
          assert.strictEqual(rowCount, 1);

          connection.close();
        });

        request.on('columnMetadata', (columnsMetadata) => {
          assert.strictEqual(Object.keys(columnsMetadata).length, 2);
        });

        request.on('row', (columns) => {
          assert.strictEqual(Object.keys(columns).length, 2);

          assert.strictEqual(columns.abc.value, 1);
          assert.strictEqual(columns.xyz.value, 2);
        });

        connection.execSql(request);
      });

      connection.on('end', () => {
        done();
      });
    });

    describe('with a polluted `Object` prototype', function() {
      beforeEach(function() {
        ({}).constructor.prototype.foo = 'bar';
      });

      afterEach(function() {
        delete ({}).constructor.prototype.foo;
      });

      it('should not have column metadata or rows be affected by the pollution', function(done) {
        const config = getConfig();

        const connection = new Connection({
          ...config,
          options: {
            ...config.options,
            useColumnNames: true
          }
        });

        if (process.env.TEDIOUS_DEBUG) {
          connection.on('debug', console.log);
        }

        connection.connect((err) => {
          if (err) {
            return done(err);
          }

          const request = new Request('select 1 as abc', (err, rowCount) => {
            assert.ifError(err);
            assert.strictEqual(rowCount, 1);

            connection.close();
          });

          request.on('columnMetadata', (columnsMetadata) => {
            assert.property(columnsMetadata, 'abc');
            assert.notProperty(columnsMetadata, 'foo');
          });

          request.on('row', (columns) => {
            assert.property(columns, 'abc');
            assert.notProperty(columns, 'foo');
          });

          connection.execSql(request);
        });

        connection.on('end', () => {
          done();
        });
      });
    });
  });

  it('should exec Sql multiple times', function(done) {
    const timesToExec = 5;
    let sqlExecCount = 0;
    const config = getConfig();

    function execSql() {
      if (sqlExecCount === timesToExec) {
        connection.close();
        return;
      }

      const request = new Request('select 8 as C1', function(err, rowCount) {
        assert.ifError(err);
        assert.strictEqual(rowCount, 1);

        sqlExecCount++;
        execSql();
      });

      request.on('doneInProc', function(rowCount, more) {
        assert.ok(more);
        assert.strictEqual(rowCount, 1);
      });

      request.on('columnMetadata', function(columnsMetadata) {
        assert.strictEqual(columnsMetadata.length, 1);
      });

      request.on('row', function(columns) {
        assert.strictEqual(columns.length, 1);
        assert.strictEqual(columns[0].value, 8);
      });

      connection.execSql(request);
    }

    let connection = new Connection(config);

    connection.connect(function(err) {
      execSql();
    });

    connection.on('end', function() {
      done();
    });

    connection.on('infoMessage', function(info) {
      // console.log("#{info.number} : #{info.message}")
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  });

  it('should exec sql with order', function(done) {
    const config = getConfig();

    const sql =
      'select top 2 object_id, name, column_id, system_type_id from sys.columns order by name, system_type_id';
    const request = new Request(sql, function(err, rowCount) {
      assert.ifError(err);
      assert.strictEqual(rowCount, 2);

      connection.close();
    });

    request.on('doneInProc', function(rowCount, more) {
      assert.ok(more);
      assert.strictEqual(rowCount, 2);
    });

    request.on('columnMetadata', function(columnsMetadata) {
      assert.strictEqual(columnsMetadata.length, 4);
    });

    request.on('order', function(orderColumns) {
      assert.strictEqual(orderColumns.length, 2);
      assert.strictEqual(orderColumns[0], 2);
      assert.strictEqual(orderColumns[1], 4);
    });

    request.on('row', function(columns) {
      assert.strictEqual(columns.length, 4);
    });

    let connection = new Connection(config);

    connection.connect(function(err) {
      connection.execSql(request);
    });

    connection.on('end', function() {
      done();
    });

    connection.on('infoMessage', function(info) {
      // console.log("#{info.number} : #{info.message}")
    });

    connection.on('errorMessage', function(error) {
      // console.log("#{error.number} : #{error.message}")
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  });

  it('should exec Bad Sql', function(done) {
    const config = getConfig();

    const request = new Request('bad syntax here', function(err) {
      assert.ok(err);

      connection.close();
    });

    let connection = new Connection(config);

    connection.connect(function(err) {
      connection.execSql(request);
    });

    connection.on('end', function() {
      done();
    });

    connection.on('errorMessage', function(error) {
      // console.log("#{error.number} : #{error.message}")
      assert.ok(error);
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  });

  it('should close connection request pending', function(done) {
    const config = getConfig();

    const request = new Request('select 8 as C1', function(err, rowCount) {
      assert.instanceOf(err, RequestError);
      assert.strictEqual(/** @type {RequestError} */(err).code, 'ECLOSE');
    });

    const connection = new Connection(config);

    connection.connect(function(err) {
      assert.ifError(err);
      connection.execSql(request);

      // This should trigger request callback with error as there is
      // request pending now.
      connection.close();
    });

    connection.on('end', function() {
      done();
    });

    connection.on('error', function(err) {
    });

    connection.on('infoMessage', function(info) {
      // console.log("#{info.number} : #{info.message}")
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  });

  it('should sql with multiple result sets', function(done) {
    const config = getConfig();
    let row = 0;

    const request = new Request('select 1; select 2;', function(err, rowCount) {
      assert.ifError(err);
      assert.strictEqual(rowCount, 2);

      connection.close();
    });

    request.on('doneInProc', function(rowCount, more) {
      assert.strictEqual(rowCount, 1);
    });

    request.on('columnMetadata', function(columnsMetadata) {
      assert.strictEqual(columnsMetadata.length, 1);
    });

    request.on('row', function(columns) {
      assert.strictEqual(columns[0].value, ++row);
    });

    let connection = new Connection(config);

    connection.connect(function(err) {
      connection.execSql(request);
    });

    connection.on('end', function() {
      done();
    });

    connection.on('infoMessage', function(info) {
      // console.log("#{info.number} : #{info.message}")
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  });

  it('should row count for update', function(done) {
    const config = getConfig();

    const setupSql = `\
  create table #tab1 (id int, name nvarchar(10));
  insert into #tab1 values(1, N'a1');
  insert into #tab1 values(2, N'a2');
  insert into #tab1 values(3, N'b1');
  update #tab1 set name = 'a3' where name like 'a%'\
  `;

    const request = new Request(setupSql, function(err, rowCount) {
      assert.ifError(err);
      assert.strictEqual(rowCount, 5);
      connection.close();
    });

    let connection = new Connection(config);

    connection.connect(function(err) {
      connection.execSql(request);
    });

    connection.on('end', function() {
      done();
    });

    connection.on('infoMessage', function(info) {
      // console.log("#{info.number} : #{info.message}")
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  });

  it('should row collection on request completion', function(done) {

    const request = new Request('select 1 as a; select 2 as b;', function(
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

    const config = getConfig();

    let connection = new Connection({
      ...config,
      options: {
        ...config.options,
        rowCollectionOnRequestCompletion: true
      }
    });

    connection.connect(function(err) {
      connection.execSql(request);
    });

    connection.on('end', function() {
      done();
    });

    connection.on('infoMessage', function(info) {
      // console.log("#{info.number} : #{info.message}")
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  });

  it('should row collection on Done', function(done) {
    let doneCount = 0;

    const request = new Request('select 1 as a; select 2 as b;', function(
      err,
      rowCount,
      rows
    ) {
      connection.close();
    });

    request.on('doneInProc', function(rowCount, more, rows) {
      if (!rows) {
        assert.fail('Did not expect `rows` to be undefined');
      }

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

    const config = getConfig();

    let connection = new Connection({
      ...config,
      options: {
        ...config.options,
        rowCollectionOnDone: true
      }
    });

    connection.connect(function(err) {
      connection.execSql(request);
    });

    connection.on('end', function() {
      done();
    });

    connection.on('infoMessage', function(info) {
      // console.log("#{info.number} : #{info.message}")
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  });

  it('should exec proc as sql', function(done) {
    const config = getConfig();

    const request = new Request('exec sp_help int', function(err, rowCount) {
      assert.ifError(err);
      assert.strictEqual(rowCount, 0);

      connection.close();
    });

    request.on('doneProc', function(rowCount, more, returnStatus) {
      assert.ok(!more);
      assert.strictEqual(returnStatus, 0);
    });

    request.on('doneInProc', function(rowCount, more) {
      assert.ok(more);
    });

    request.on('row', function(columns) {
      assert.ok(true);
    });

    let connection = new Connection(config);

    connection.connect(function(err) {
      connection.execSql(request);
    });

    connection.on('end', function() {
      done();
    });

    connection.on('infoMessage', function(info) {
      // console.log("#{info.number} : #{info.message}")
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  });

  it('should reset Connection', function(done) {
    const config = getConfig();

    /**
     * @param {(err?: Error | null | undefined, result?: any) => void} callback
     */
    function testAnsiNullsOptionOn(callback) {
      testAnsiNullsOption(true, callback);
    }

    /**
     * @param {(err?: Error | null | undefined, result?: any) => void} callback
     */
    function testAnsiNullsOptionOff(callback) {
      testAnsiNullsOption(false, callback);
    }

    /**
     * @param {boolean} expectedOptionOn
     * @param {(err?: Error | null | undefined, result?: any) => void} callback
     */
    function testAnsiNullsOption(expectedOptionOn, callback) {
      const request = new Request('select @@options & 32', function(err, rowCount) {
        callback(err);
      });

      request.on('row', function(columns) {
        const optionOn = columns[0].value === 32;
        assert.strictEqual(optionOn, expectedOptionOn);
      });

      connection.execSql(request);
    }

    /**
     * @param {(err?: Error | null | undefined, result?: any) => void} callback
     */
    function setAnsiNullsOptionOff(callback) {
      const request = new Request('set ansi_nulls off', function(err, rowCount) {
        callback(err);
      });

      connection.execSqlBatch(request);
    }

    let connection = new Connection(config);

    connection.on('resetConnection', function() {
      assert.ok(true);
    });

    connection.connect(function(err) {
      async.series([
        testAnsiNullsOptionOn,
        setAnsiNullsOptionOff,
        testAnsiNullsOptionOff,
        function(callback) {
          connection.reset(function(err) {
            if (connection.config.options.tdsVersion < '7_2') {
              // TDS 7_1 doesnt send RESETCONNECTION acknowledgement packet
              assert.ok(true);
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

    connection.on('end', function() {
      done();
    });

    connection.on('infoMessage', function(info) {
      // console.log("#{info.number} : #{info.message}")
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  });

  it('should support cancelling a request while it is processed on the server', function(done) {
    const config = getConfig();

    /** @type {[number, number]} */
    let cancelledAt;

    const request = new Request("select 1 as C1; waitfor delay '00:00:05'; select 2 as C2", (err, rowCount, rows) => {
      assert.instanceOf(err, Error);
      assert.strictEqual(/** @type {Error} */(err).message, 'Canceled.');

      assert.isUndefined(rowCount);

      // Ensure that not too much time has passed since the cancellation was requested.
      const [seconds, nanoSeconds] = process.hrtime(cancelledAt);
      assert.strictEqual(seconds, 0);
      assert.isBelow(nanoSeconds, 500 * 1000 * 1000);

      // Ensure that the connection is still usable after the cancelTimeout has passed.
      setTimeout(() => {
        const request = new Request('select 1', (err) => {
          assert.ifError(err);

          connection.close();
        });

        connection.execSql(request);
      }, 500 + 100);
    });

    request.on('doneInProc', (rowCount, more) => {
      assert.ok(false);
    });

    request.on('doneProc', (rowCount, more) => {
      assert.ok(false);
    });

    request.on('done', (rowCount, more, rows) => {
      assert.ok(false);
    });

    request.on('columnMetadata', (columnsMetadata) => {
      assert.ok(false);
    });

    request.on('row', (columns) => {
      assert.ok(false);
    });

    const connection = new Connection({
      ...config,
      options: {
        ...config.options,
        cancelTimeout: 500
      }
    });

    connection.connect((err) => {
      connection.execSql(request);

      setTimeout(() => {
        cancelledAt = process.hrtime();
        request.cancel();
      }, 2000);
    });

    connection.on('end', () => {
      done();
    });

    connection.on('infoMessage', (info) => {
      // console.log("#{info.number} : #{info.message}")
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  });

  it('should request timeout', (done) => {
    const request = new Request(
      "select 1 as C1;waitfor delay '00:00:05';select 2 as C2",
      function(err, rowCount, rows) {
        assert.equal(/** @type {Error} */(err).message, 'Timeout: Request failed to complete in 1000ms');

        connection.close();
      }
    );

    request.on('doneInProc', function(rowCount, more) {
      assert.ok(false);
    });

    request.on('doneProc', function(rowCount, more) {
      assert.ok(false);
    });

    request.on('done', function(rowCount, more, rows) {
      assert.ok(false);
    });

    request.on('columnMetadata', function(columnsMetadata) {
      assert.ok(false);
    });

    request.on('row', function(columns) {
      assert.ok(false);
    });

    const config = getConfig();

    let connection = new Connection({
      ...config,
      options: {
        ...config.options,
        requestTimeout: 1000
      }
    });

    connection.connect(function(err) {
      connection.execSql(request);
    });

    connection.on('end', function() {
      done();
    });

    connection.on('infoMessage', function(info) {
      // console.log("#{info.number} : #{info.message}")
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  });
});

describe('Advanced Input Test', function() {
  /**
   * @param {Mocha.Done} done
   * @param {import("../../src/connection").ConnectionConfiguration} config
   * @param {string} sql
   * @param {(error: Error | null | undefined, rowCount?: number) => void} requestCallback
   */
  function runSqlBatch(done, config, sql, requestCallback) {
    const connection = new Connection(config);

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    const request = new Request(sql, function(err, rowCount) {
      requestCallback(err, rowCount);
      connection.close();
    });

    connection.connect(function(err) {
      assert.ifError(err);
      connection.execSqlBatch(request);
    });

    connection.on('end', function() {
      done();
    });
  }

  // Test that the default behavior allows adding null values to a
  // temporary table where the nullability is not explicitly declared.
  it('should test AnsiNullDefault', function(done) {
    const sql =
      'create table #testAnsiNullDefault (id int);\n' +
      'insert #testAnsiNullDefault values (null);\n' +
      'drop table #testAnsiNullDefault;';

    runSqlBatch(done, getConfig(), sql, function(err) {
      assert.ifError(err);
    });
  });

  // Test that the default behavior can be overridden (so that temporary
  // table columns are non-nullable by default).
  it('should disable ansi null default', function(done) {
    const sql =
      'create table #testAnsiNullDefaults (id int);\n' +
      'insert #testAnsiNullDefaults values (null);\n' +
      'drop table #testAnsiNullDefaults;';

    const config = getConfig();
    runSqlBatch(done, { ...config, options: { ...config.options, enableAnsiNullDefault: false } }, sql, function(/** @type {Error | null | undefined} */err) {
      assert.instanceOf(err, RequestError);
      assert.strictEqual(/** @type {RequestError} */(err).number, 515);
    }); // Cannot insert the value NULL
  });
});

describe('Date Insert Test', function() {
  /**
   * @param {Mocha.Done} done
   * @param {number | undefined} datefirst
   */
  function testDateFirstImpl(done, datefirst) {
    datefirst = datefirst || 7;

    const config = getConfig();
    const connection = new Connection({
      ...config,
      options: {
        ...config.options,
        datefirst: datefirst
      }
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    const request = new Request('select @@datefirst', function(err) {
      assert.ifError(err);
      connection.close();
    });

    request.on('row', function(columns) {
      const dateFirstActual = columns[0].value;
      assert.strictEqual(dateFirstActual, datefirst);
    });

    connection.connect(function(err) {
      assert.ifError(err);
      connection.execSql(request);
    });

    connection.on('end', function() {
      done();
    });
  }

  // Test that the default setting for DATEFIRST is 7
  it('should test date first default', function(done) {
    testDateFirstImpl(done, undefined);
  });

  // Test that the DATEFIRST setting can be changed via an optional configuration
  it('should test date first custom', function(done) {
    testDateFirstImpl(done, 3);
  });

  // Test that an invalid DATEFIRST setting throws
  it('should test bad date first', function(done) {
    const config = getConfig();

    assert.throws(function() {
      new Connection({
        ...config,
        options: {
          datefirst: -1
        }
      });
    });

    done();
  });
});

describe('Language Insert Test', function() {
  /**
   * @param {Mocha.Done} done
   * @param {string | undefined} language
   */
  function testLanguage(done, language) {
    language = language || 'us_english';
    const config = getConfig();

    const connection = new Connection({
      ...config,
      options: {
        ...config.options,
        language: language
      }
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    const request = new Request('select @@language', function(err) {
      assert.ifError(err);
      connection.close();
    });

    request.on('row', function(columns) {
      const languageActual = columns[0].value;
      assert.strictEqual(languageActual, language);
    });

    connection.connect(function(err) {
      assert.ifError(err);
      connection.execSql(request);
    });

    connection.on('end', function() {
      done();
    });
  }
  // Test that the default setting for LANGUAGE is us_english
  it('should test language default', function(done) {
    testLanguage(done, undefined);
  });

  // Test that the LANGUAGE setting can be changed via an optional configuration
  it('should test language custom', function(done) {
    testLanguage(done, 'Deutsch');
  });
});

describe('custom textsize value', function() {
  it('should set the textsize to the given value', function(done) {
    const config = getConfig();

    const connection = new Connection({
      ...config,
      options: {
        ...config.options,
        textsize: 123456
      }
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    connection.connect((err) => {
      /**
       * @type {number | undefined}
       */
      let textsize;

      const request = new Request('SELECT @@TEXTSIZE', () => {
        if (err) {
          return done(err);
        }

        assert.strictEqual(textsize, 123456);

        connection.close();

        done();
      });

      request.on('row', (row) => {
        textsize = row[0].value;
      });

      connection.execSql(request);
    });
  });

  it('should fail if the textsize is below -1', function() {
    const config = getConfig();

    assert.throws(() => {
      new Connection({
        ...config,
        options: {
          ...config.options,
          textsize: -2
        }
      });
    }, TypeError, 'The "config.options.textsize" can\'t be smaller than -1.');
  });

  it('should fail if the textsize is above 2147483647', function() {
    const config = getConfig();

    assert.throws(() => {
      new Connection({
        ...config,
        options: {
          ...config.options,
          textsize: 2147483648
        }
      });
    }, TypeError, 'The "config.options.textsize" can\'t be greater than 2147483647.');
  });

  it('should fail if the textsize is not a number', function() {
    const config = getConfig();

    assert.throws(() => {
      new Connection({
        ...config,
        options: {
          ...config.options,
          textsize: /** @type {any} */('textSize')
        }
      });
    }, TypeError, 'The "config.options.textsize" property must be of type number or null.');
  });

  it('should default to 2147483647', function(done) {
    const config = getConfig();

    const connection = new Connection({
      ...config,
      options: {
        ...config.options,
        textsize: /** @type {any} */(undefined)
      }
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    connection.connect((err) => {
      /**
       * @type {number | undefined}
       */
      let textsize;

      const request = new Request('SELECT @@TEXTSIZE', () => {
        if (err) {
          return done(err);
        }

        assert.strictEqual(textsize, 2147483647);

        connection.close();

        done();
      });

      request.on('row', (row) => {
        textsize = row[0].value;
      });

      connection.execSql(request);
    });
  });

  it('should allow setting it to -1', function(done) {
    const config = getConfig();

    const connection = new Connection({
      ...config,
      options: {
        ...config.options,
        textsize: -1
      }
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    connection.connect((err) => {
      /**
       * @type {number | undefined}
       */
      let textsize;

      const request = new Request('SELECT @@TEXTSIZE', () => {
        if (err) {
          return done(err);
        }

        if (connection.config.options.tdsVersion <= '7_2') {
          assert.strictEqual(textsize, 2147483647);
        } else {
          assert.strictEqual(textsize, -1);
        }

        connection.close();

        done();
      });

      request.on('row', (row) => {
        textsize = row[0].value;
      });

      connection.execSql(request);
    });
  });

  it('should allow setting it to 0 and reset to server defaults', function(done) {
    const config = getConfig();

    const connection = new Connection({
      ...config,
      options: {
        ...config.options,
        textsize: 0
      }
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    connection.connect((err) => {
      /**
       * @type {number | undefined}
       */
      let textsize;

      const request = new Request('SELECT @@TEXTSIZE', () => {
        if (err) {
          return done(err);
        }

        assert.strictEqual(textsize, 4096);

        connection.close();

        done();
      });

      request.on('row', (row) => {
        textsize = row[0].value;
      });

      connection.execSql(request);
    });
  });

  it('truncates floating point numbers', function(done) {
    const config = getConfig();

    const connection = new Connection({
      ...config,
      options: {
        ...config.options,
        textsize: 1000.0123
      }
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    connection.connect((err) => {
      /**
       * @type {number | undefined}
       */
      let textsize;

      const request = new Request('SELECT @@TEXTSIZE', () => {
        if (err) {
          return done(err);
        }

        assert.strictEqual(textsize, 1000);

        connection.close();

        done();
      });

      request.on('row', (row) => {
        textsize = row[0].value;
      });

      connection.execSql(request);
    });
  });
});

describe('should test date format', function() {
  /**
   * @param {Mocha.Done} done
   * @param {string | undefined} dateFormat
   */
  function testDateFormat(done, dateFormat) {
    dateFormat = dateFormat || 'mdy';
    const config = getConfig();

    const connection = new Connection({
      ...config,
      options: {
        ...config.options,
        dateFormat: dateFormat
      }
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    const request = new Request(
      'SELECT DATE_FORMAT FROM sys.dm_exec_sessions WHERE SESSION_ID = @@SPID ',
      function(err) {
        assert.ifError(err);
        connection.close();
      }
    );

    request.on('row', function(columns) {
      const dateFormatActual = columns[0].value;
      assert.strictEqual(dateFormatActual, dateFormat);
    });

    connection.connect(function(err) {
      assert.ifError(err);
      connection.execSql(request);
    });

    connection.on('end', function() {
      done();
    });
  }
  // Test that the default setting for DATEFORMAT is mdy
  it('should test date format default', function(done) {
    testDateFormat(done, undefined);
  });

  // Test that the DATEFORMAT setting can be changed via an optional configuration
  it('should test custom dateformat', function(done) {
    testDateFormat(done, 'dmy');
  });
});

describe('Boolean Config Options Test', function() {
  /**
   * @param {Mocha.Done} done
   * @param {string} optionName
   * @param {boolean | undefined} optionValue
   * @param {number} optionFlag
   * @param {boolean} defaultOn
   */
  function testBooleanConfigOption(done, optionName, optionValue, optionFlag, defaultOn) {
    const config = getConfig();
    const connection = new Connection({
      ...config,
      options: {
        ...config.options,
        [optionName]: optionValue
      }
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    const request = new Request(
      `SELECT (${optionFlag} & @@OPTIONS) AS OPTION_FLAG_OR_ZERO;`,
      function(err, rowCount) {
        assert.ifError(err);
        assert.strictEqual(rowCount, 1);

        connection.close();
      }
    );

    request.on('columnMetadata', function(columnsMetadata) {
      assert.strictEqual(Object.keys(columnsMetadata).length, 1);
    });

    request.on('row', function(columns) {
      assert.strictEqual(Object.keys(columns).length, 1);

      let expectedValue;
      if (optionValue === true || (optionValue === undefined && defaultOn)) {
        expectedValue = optionFlag;
      } else {
        expectedValue = 0;
      }

      assert.strictEqual(columns[0].value, expectedValue);
    });

    connection.connect(function(err) {
      assert.ifError(err);

      connection.execSql(request);
    });

    connection.on('end', function() {
      done();
    });
  }

  /**
   * @param {Mocha.Done} done
   * @param {string} optionName
   */
  function testBadBooleanConfigOption(done, optionName) {
    const config = getConfig();

    assert.throws(function() {
      new Connection({
        ...config,
        options: {
          ...config.options,
          [optionName]: 'on'
        }
      });
    });

    done();
  }

  it('should test ansi null default', function(done) {
    testBooleanConfigOption(done, 'enableAnsiNull', undefined, 32, true);
  });

  it('should test ansi null on', function(done) {
    testBooleanConfigOption(done, 'enableAnsiNull', true, 32, true);
  });

  it('should test ansi null off', function(done) {
    testBooleanConfigOption(done, 'enableAnsiNull', false, 32, true);
  });

  it('should test bad ansi null', function(done) {
    testBadBooleanConfigOption(done, 'enableAnsiNull');
  });

  it('should test ansi null default default', function(done) {
    testBooleanConfigOption(done, 'enableAnsiNullDefault', undefined, 1024, true);
  });

  it('should test ansi null default on', function(done) {
    testBooleanConfigOption(done, 'enableAnsiNullDefault', true, 1024, true);
  });

  it('should test ansi null default off', function(done) {
    testBooleanConfigOption(done, 'enableAnsiNullDefault', false, 1024, true);
  });

  it('should test bad ansi null default', function(done) {
    testBadBooleanConfigOption(done, 'enableAnsiNullDefault');
  });

  it('should test ansi padding default', function(done) {
    testBooleanConfigOption(done, 'enableAnsiPadding', undefined, 16, true);
  });

  it('should test ansi padding on', function(done) {
    testBooleanConfigOption(done, 'enableAnsiPadding', true, 16, true);
  });

  it('should test ansi padding off', function(done) {
    testBooleanConfigOption(done, 'enableAnsiPadding', false, 16, true);
  });

  it('should test bad ansi padding', function(done) {
    testBadBooleanConfigOption(done, 'enableAnsiPadding');
  });

  it('should test ansi warnings default', function(done) {
    testBooleanConfigOption(done, 'enableAnsiWarnings', undefined, 8, true);
  });

  it('should test ansi warnings on', function(done) {
    testBooleanConfigOption(done, 'enableAnsiWarnings', true, 8, true);
  });

  it('should test ansi warnings off', function(done) {
    testBooleanConfigOption(done, 'enableAnsiWarnings', false, 8, true);
  });

  it('should test bad ansi warnings', function(done) {
    testBadBooleanConfigOption(done, 'enableAnsiWarnings');
  });

  it('should test arith abort default', function(done) {
    testBooleanConfigOption(done, 'enableArithAbort', undefined, 64, true);
  });

  it('should test arith abort on', function(done) {
    testBooleanConfigOption(done, 'enableArithAbort', true, 64, false);
  });

  it('should test arith abort off', function(done) {
    testBooleanConfigOption(done, 'enableArithAbort', false, 64, false);
  });

  it('should test bad arith abort', function(done) {
    testBadBooleanConfigOption(done, 'enableArithAbort');
  });

  it('should test concat null yield null default', function(done) {
    testBooleanConfigOption(done, 'enableConcatNullYieldsNull', undefined, 4096, true);
  });

  it('should test concat null yields null on', function(done) {
    testBooleanConfigOption(done, 'enableConcatNullYieldsNull', true, 4096, true);
  });

  it('should test ocncat null yields null off', function(done) {
    testBooleanConfigOption(done, 'enableConcatNullYieldsNull', false, 4096, true);
  });

  it('should test bad concat null yields null', function(done) {
    testBadBooleanConfigOption(done, 'enableConcatNullYieldsNull');
  });

  it('should test cursor close on commit default', function(done) {
    testBooleanConfigOption(done, 'enableCursorCloseOnCommit', undefined, 4, false);
  });

  it('should test cursor close on commit on', function(done) {
    testBooleanConfigOption(done, 'enableCursorCloseOnCommit', true, 4, false);
  });

  it('should test cursor close on commit off', function(done) {
    testBooleanConfigOption(done, 'enableCursorCloseOnCommit', false, 4, false);
  });

  it('should test bad cursor close on commit', function(done) {
    testBadBooleanConfigOption(done, 'enableCursorCloseOnCommit');
  });

  it('should test implicit transactions default', function(done) {
    testBooleanConfigOption(done, 'enableImplicitTransactions', undefined, 2, false);
  });

  it('should test implicit transactions on', function(done) {
    testBooleanConfigOption(done, 'enableImplicitTransactions', true, 2, false);
  });

  it('should test implicit transactions off', function(done) {
    testBooleanConfigOption(done, 'enableImplicitTransactions', false, 2, false);
  });

  it('should test bad implicit transactions', function(done) {
    testBadBooleanConfigOption(done, 'enableImplicitTransactions');
  });

  it('should test numeric round abort default', function(done) {
    testBooleanConfigOption(done, 'enableNumericRoundabort', undefined, 8192, false);
  });

  it('should test numeric round abort on', function(done) {
    testBooleanConfigOption(done, 'enableNumericRoundabort', true, 8192, false);
  });

  it('should test numeric round abort off', function(done) {
    testBooleanConfigOption(done, 'enableNumericRoundabort', false, 8192, false);
  });

  it('should test bad numeric round abort', function(done) {
    testBadBooleanConfigOption(done, 'enableNumericRoundabort');
  });

  it('should test quoted identifier default', function(done) {
    testBooleanConfigOption(done, 'enableQuotedIdentifier', undefined, 256, true);
  });

  it('should test quoted identifier on', function(done) {
    testBooleanConfigOption(done, 'enableQuotedIdentifier', true, 256, true);
  });

  it('should test quoted identifier off', function(done) {
    testBooleanConfigOption(done, 'enableQuotedIdentifier', false, 256, true);
  });

  it('should test bad quoted identifier', function(done) {
    testBadBooleanConfigOption(done, 'enableQuotedIdentifier');
  });

  it('should test abort transaction on error default', function(done) {
    testBooleanConfigOption(done, 'abortTransactionOnError', undefined, 16384, false);
  });

  it('should test abort transaction on error on', function(done) {
    testBooleanConfigOption(done, 'abortTransactionOnError', true, 16384, false);
  });

  it('should test abort transaction on error off', function(done) {
    testBooleanConfigOption(done, 'abortTransactionOnError', false, 16384, false);
  });

  it('should test bad abort transaction on error', function(done) {
    testBadBooleanConfigOption(done, 'abortTransactionOnError');
  });
});
