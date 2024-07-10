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

describe('Database Collation Support', function() {
  let connection: Connection;
  let originalDatabaseName: string;

  before(function() {
    // Creating new databases on Azure SQL is a bit of a headache.
    if (/\w+\.database\.windows\.net/.test(getConfig().server)) {
      this.skip();
    }
  });

  beforeEach(function(done) {
    connection = new Connection(getConfig());
    connection.once('databaseChange', (databaseName) => {
      originalDatabaseName = databaseName;
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    connection.connect(done);
  });

  beforeEach(function(done) {
    const request = new Request('DROP DATABASE IF EXISTS __tedious_collation_1', done);
    connection.execSqlBatch(request);
  });

  beforeEach(function(done) {
    const request = new Request('CREATE DATABASE __tedious_collation_1 COLLATE Chinese_PRC_CI_AS', done);
    connection.execSqlBatch(request);
  });

  afterEach(function(done) {
    const request = new Request('USE ' + originalDatabaseName, done);
    connection.execSqlBatch(request);
  });

  afterEach(function(done) {
    const request = new Request('DROP DATABASE __tedious_collation_1', done);
    connection.execSqlBatch(request);
  });

  afterEach(function(done) {
    if (!connection.closed) {
      connection.on('end', done);
      connection.close();
    } else {
      done();
    }
  });

  it('tracks the current database\'s collation', function(done) {
    const request = new Request('USE __tedious_collation_1', (err) => {
      if (err) {
        return done(err);
      }

      const collation = connection.databaseCollation;
      assert.strictEqual(collation?.lcid, 2052);
      assert.strictEqual(collation?.flags, Flags.IGNORE_CASE | Flags.IGNORE_KANA | Flags.IGNORE_WIDTH);
      assert.strictEqual(collation?.version, 0);
      assert.strictEqual(collation?.sortId, 0);
      assert.strictEqual(collation?.codepage, 'CP936');

      done();
    });

    connection.execSqlBatch(request);
  });

  it('converts `varchar` parameters with the current collation\'s encoding', function(done) {
    const request = new Request('USE __tedious_collation_1', (err) => {
      if (err) {
        return done(err);
      }

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

    connection.execSqlBatch(request);
  });

  it('converts `char` parameters with the current collation\'s encoding', function(done) {
    const request = new Request('USE __tedious_collation_1', (err) => {
      if (err) {
        return done(err);
      }

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

    connection.execSqlBatch(request);
  });

  it('converts `text` parameters with the current collation\'s encoding', function(done) {
    const request = new Request('USE __tedious_collation_1', (err) => {
      if (err) {
        return done(err);
      }

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

    connection.execSqlBatch(request);
  });

  describe('bulk loads', function() {
    beforeEach(function(done) {
      const request = new Request('USE __tedious_collation_1', done);
      connection.execSqlBatch(request);
    });

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
      const request = new Request('USE __tedious_collation_1', done);
      connection.execSqlBatch(request);
    });

    beforeEach(function(done) {
      const sql = 'BEGIN TRY DROP TYPE TediousTestType END TRY BEGIN CATCH END CATCH';
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
