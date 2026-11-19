import { assert } from 'chai';

import Connection from '../../src/connection';
import Request from '../../src/request';
import { Flags } from '../../src/collation';
import { TYPES } from '../../src/data-type';
import { debugOptionsFromEnv } from '../helpers/debug-options-from-env';

import defaultConfig from '../config';

function getConfig() {
  const config = {
    ...defaultConfig,
    options: {
      ...defaultConfig.options,
      debug: debugOptionsFromEnv(),
      tdsVersion: process.env.TEDIOUS_TDS_VERSION
    }
  };

  return config;
}

const DATABASE_NAME = '__tedious_collation_1';

function connect(database: string | undefined, callback: (err: Error | undefined, connection: Connection) => void) {
  const config = getConfig();
  const connection = new Connection({ ...config, options: { ...config.options, database } });

  if (process.env.TEDIOUS_DEBUG) {
    connection.on('debug', console.log);
  }

  connection.connect((err) => {
    callback(err, connection);
  });
}

function execSqlBatch(connection: Connection, sql: string, callback: (err: Error | null | undefined) => void) {
  connection.execSqlBatch(new Request(sql, callback));
}

function close(connection: Connection, callback: () => void) {
  if (connection.closed) {
    return callback();
  }

  connection.on('end', callback);
  connection.close();
}

describe('Database Collation Support', function() {
  let connection: Connection;
  let isAzureSqlDatabase = false;
  let databaseCreated = false;

  before(function(done) {
    // Creating new databases on Azure SQL is a bit of a headache.
    if (/\w+\.database\.windows\.net/.test(getConfig().server)) {
      return this.skip();
    }

    // Create the test database once, from a separate connection to the
    // configured database. Each test then connects directly to the test
    // database, instead of switching to it via `USE`, as Azure SQL Database
    // (and the Azure SQL Database container) do not support `USE`.
    connect(getConfig().options.database, (err, admin) => {
      if (err) {
        return done(err);
      }

      const request = new Request("SELECT CAST(SERVERPROPERTY('EngineEdition') AS int)", (err) => {
        if (err) {
          return close(admin, () => done(err));
        }

        execSqlBatch(admin, `DROP DATABASE IF EXISTS ${DATABASE_NAME}`, (err) => {
          if (err) {
            return close(admin, () => done(err));
          }

          execSqlBatch(admin, `CREATE DATABASE ${DATABASE_NAME} COLLATE Chinese_PRC_CI_AS`, (err) => {
            databaseCreated = !err;
            close(admin, () => done(err));
          });
        });
      });

      request.on('row', (row) => {
        // 5 = Azure SQL Database
        isAzureSqlDatabase = row[0].value === 5;
      });

      admin.execSql(request);
    });
  });

  after(function(done) {
    if (!databaseCreated) {
      return done();
    }

    connect(getConfig().options.database, (err, admin) => {
      if (err) {
        return done(err);
      }

      // On SQL Server, sessions from connections that were just closed can
      // briefly linger and block `DROP DATABASE`. `SINGLE_USER` is not
      // supported on Azure SQL Database, which does not need it.
      const sql = isAzureSqlDatabase ?
        `DROP DATABASE ${DATABASE_NAME}` :
        `ALTER DATABASE ${DATABASE_NAME} SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE ${DATABASE_NAME}`;

      execSqlBatch(admin, sql, (err) => {
        close(admin, () => done(err));
      });
    });
  });

  beforeEach(function(done) {
    connect(DATABASE_NAME, (err, c) => {
      connection = c;
      done(err);
    });
  });

  afterEach(function(done) {
    close(connection, done);
  });

  function assertTestDatabaseCollation(collation: Connection['databaseCollation']) {
    assert.strictEqual(collation?.lcid, 2052);
    assert.strictEqual(collation?.flags, Flags.IGNORE_CASE | Flags.IGNORE_KANA | Flags.IGNORE_WIDTH);
    assert.strictEqual(collation?.version, 0);
    assert.strictEqual(collation?.sortId, 0);
    assert.strictEqual(collation?.codepage, 'CP936');
  }

  it('tracks the collation of the database it connects to', function() {
    assertTestDatabaseCollation(connection.databaseCollation);
  });

  it('tracks the current database\'s collation when switching databases', function(done) {
    if (isAzureSqlDatabase) {
      // Azure SQL Database does not support switching databases via `USE`.
      return this.skip();
    }

    const originalDatabaseName = getConfig().options.database ?? 'master';

    execSqlBatch(connection, `USE ${originalDatabaseName}`, (err) => {
      if (err) {
        return done(err);
      }

      assert.notStrictEqual(connection.databaseCollation?.lcid, 2052);

      execSqlBatch(connection, `USE ${DATABASE_NAME}`, (err) => {
        if (err) {
          return done(err);
        }

        assertTestDatabaseCollation(connection.databaseCollation);

        done();
      });
    });
  });

  it('converts `varchar` parameters with the current collation\'s encoding', function(done) {
    let result: string;
    const request = new Request('SELECT @p1', function(err) {
      if (err) {
        return done(err);
      }

      assert.strictEqual(result, '中文');

      done();
    });

    request.on('row', (row) => {
      result = row[0].value;
    });

    request.addParameter('p1', TYPES.VarChar, '中文');

    connection.execSql(request);
  });

  it('converts `char` parameters with the current collation\'s encoding', function(done) {
    let result: string;
    const request = new Request('SELECT @p1', function(err) {
      if (err) {
        return done(err);
      }

      assert.strictEqual(result, '中文');

      done();
    });

    request.on('row', (row) => {
      result = row[0].value;
    });

    request.addParameter('p1', TYPES.Char, '中文');

    connection.execSql(request);
  });

  it('converts `text` parameters with the current collation\'s encoding', function(done) {
    let result: string;
    const request = new Request('SELECT @p1', function(err) {
      if (err) {
        return done(err);
      }

      assert.strictEqual(result, '中文');

      done();
    });

    request.on('row', (row) => {
      result = row[0].value;
    });

    request.addParameter('p1', TYPES.Text, '中文');

    connection.execSql(request);
  });

  describe('bulk loads', function() {
    beforeEach(function(done) {
      const request = new Request('DROP TABLE IF EXISTS collation_test', done);
      connection.execSqlBatch(request);
    });

    beforeEach(function(done) {
      const request = new Request(`
        CREATE TABLE collation_test (
          one varchar(10) NOT NULL,
          two char(10) NOT NULL,
          three text NOT NULL
        )
      `, done);
      connection.execSqlBatch(request);
    });

    afterEach(function(done) {
      const request = new Request('DROP TABLE IF EXISTS collation_test', done);
      connection.execSqlBatch(request);
    });

    it('encodes values with the current database encoding', function(done) {
      const bulkLoad = connection.newBulkLoad('collation_test', (err) => {
        if (err) {
          return done(err);
        }

        let values: [string, string, string];
        const request = new Request('SELECT * FROM collation_test', (err) => {
          if (err) {
            return done(err);
          }

          assert.deepEqual(values, ['中文', '中文      ', '中文']);

          done();
        });

        request.on('row', (row) => {
          values = [row[0].value, row[1].value, row[2].value];
        });

        connection.execSql(request);
      });

      bulkLoad.addColumn('one', TYPES.VarChar, { length: 255, nullable: false });
      bulkLoad.addColumn('two', TYPES.Char, { length: 10, nullable: false });
      bulkLoad.addColumn('three', TYPES.Text, { nullable: false });

      connection.execBulkLoad(bulkLoad, [
        { one: '中文', two: '中文', three: '中文' }
      ]);
    });

    it('encodes values with the current database encoding (`addRow`)', function(done) {
      const bulkLoad = connection.newBulkLoad('collation_test', (err) => {
        if (err) {
          return done(err);
        }

        let values: [string, string, string];
        const request = new Request('SELECT * FROM collation_test', (err) => {
          if (err) {
            return done(err);
          }

          assert.deepEqual(values, ['中文', '中文      ', '中文']);

          done();
        });

        request.on('row', (row) => {
          values = [row[0].value, row[1].value, row[2].value];
        });

        connection.execSql(request);
      });

      bulkLoad.addColumn('one', TYPES.VarChar, { length: 255, nullable: false });
      bulkLoad.addColumn('two', TYPES.Char, { length: 10, nullable: false });
      bulkLoad.addColumn('three', TYPES.Text, { nullable: false });

      connection.execBulkLoad(bulkLoad, [
        { one: '中文', two: '中文', three: '中文' }
      ]);
    });
  });

  describe('TVP parameter', function() {
    beforeEach(function() {
      if (process.env.TEDIOUS_TDS_VERSION && process.env.TEDIOUS_TDS_VERSION < '7_3_A') {
        this.skip();
      }
    });

    beforeEach(function(done) {
      const sql = 'DROP PROCEDURE IF EXISTS __tediousTvpTest; DROP TYPE IF EXISTS TediousTestType';
      connection.execSqlBatch(new Request(sql, done));
    });

    beforeEach(function(done) {
      connection.execSqlBatch(new Request(`
        CREATE TYPE TediousTestType AS TABLE (
          one varchar(10) NOT NULL,
          two char(10) NOT NULL
        )
      `, done));
    });

    beforeEach(function(done) {
      const sql = 'CREATE PROCEDURE __tediousTvpTest @tvp TediousTestType readonly AS BEGIN select * from @tvp END';
      connection.execSqlBatch(new Request(sql, done));
    });

    it('correctly encodes `varchar` and `char` column values', function(done) {
      const request = new Request('__tediousTvpTest', (err) => {
        if (err) {
          return done(err);
        }

        assert.deepEqual(values, [
          '中文', '中文      '
        ]);

        done();
      });

      let values: [string, string];
      request.on('row', (row) => {
        values = [row[0].value, row[1].value];
      });

      request.addParameter('tvp', TYPES.TVP, {
        columns: [
          {
            name: 'one',
            type: TYPES.VarChar,
            length: 10
          },
          {
            name: 'two',
            type: TYPES.Char,
            length: 10
          }
        ],
        rows: [
          ['中文', '中文' ]
        ]
      });

      connection.callProcedure(request);
    });
  });
});
