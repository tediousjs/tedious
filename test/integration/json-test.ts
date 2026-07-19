import { assert } from 'chai';

import Connection from '../../src/connection';
import Request from '../../src/request';
import { typeByName as TYPES } from '../../src/data-type';
import { debugOptionsFromEnv } from '../helpers/debug-options-from-env';

import defaultConfig from '../config';

const config = {
  ...defaultConfig,
  options: {
    ...defaultConfig.options,
    debug: debugOptionsFromEnv(),
    tdsVersion: process.env.TEDIOUS_TDS_VERSION
  }
};

describe('json data type', function() {
  let connection: Connection;

  beforeEach(function(done) {
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

  describe('on servers that support the json data type', function() {
    beforeEach(function() {
      if (!connection.serverSupportsJson) {
        this.skip();
      }
    });

    it('returns json columns as strings', function(done) {
      const request = new Request('SELECT CAST(\'{"a":[1,"ü"]}\' AS json)', (err) => {
        done(err);
      });

      request.on('row', (columns) => {
        assert.strictEqual(columns[0].metadata.type.name, 'JSON');
        assert.isString(columns[0].value);
        assert.deepEqual(JSON.parse(columns[0].value), { a: [1, 'ü'] });
      });

      connection.execSql(request);
    });

    it('returns null json values as `null`', function(done) {
      const request = new Request('SELECT CAST(NULL AS json)', (err) => {
        done(err);
      });

      request.on('row', (columns) => {
        assert.strictEqual(columns[0].metadata.type.name, 'JSON');
        assert.isNull(columns[0].value);
      });

      connection.execSql(request);
    });

    it('round-trips string parameter values', function(done) {
      const value = '{"a":[1,"ü"],"b":null}';

      const request = new Request('SELECT @p', (err) => {
        done(err);
      });
      request.addParameter('p', TYPES.JSON, value);

      request.on('row', (columns) => {
        assert.deepEqual(JSON.parse(columns[0].value), JSON.parse(value));
      });

      connection.execSql(request);
    });

    it('round-trips object parameter values', function(done) {
      const value = { a: [1, 'ü'], b: null };

      const request = new Request('SELECT @p', (err) => {
        done(err);
      });
      request.addParameter('p', TYPES.JSON, value);

      request.on('row', (columns) => {
        assert.deepEqual(JSON.parse(columns[0].value), value);
      });

      connection.execSql(request);
    });

    it('round-trips `null` parameter values', function(done) {
      const request = new Request('SELECT @p', (err) => {
        done(err);
      });
      request.addParameter('p', TYPES.JSON, null);

      request.on('row', (columns) => {
        assert.isNull(columns[0].value);
      });

      connection.execSql(request);
    });

    it('bulk loads json values', function(done) {
      const bulkLoad = connection.newBulkLoad('#tedious_json_bulk', (err, rowCount) => {
        if (err) {
          return done(err);
        }

        assert.strictEqual(rowCount, 3);

        const values: unknown[] = [];
        const request = new Request('SELECT [value] FROM #tedious_json_bulk ORDER BY [id]', (err) => {
          if (err) {
            return done(err);
          }

          assert.deepEqual(JSON.parse(values[0] as string), { a: [1, 'ü'] });
          assert.deepEqual(JSON.parse(values[1] as string), { b: 2 });
          assert.isNull(values[2]);
          done();
        });

        request.on('row', (columns) => {
          values.push(columns[0].value);
        });

        connection.execSqlBatch(request);
      });

      bulkLoad.addColumn('id', TYPES.Int, { nullable: false });
      bulkLoad.addColumn('value', TYPES.JSON, { nullable: true });

      const createTable = new Request('CREATE TABLE #tedious_json_bulk ([id] int NOT NULL, [value] json NULL)', (err) => {
        if (err) {
          return done(err);
        }

        connection.execBulkLoad(bulkLoad, [
          [1, '{"a":[1,"ü"]}'],
          [2, { b: 2 }],
          [3, null]
        ]);
      });

      connection.execSqlBatch(createTable);
    });

    it('round-trips json values in table-valued parameters', function(done) {
      const createType = new Request('DROP TYPE IF EXISTS [__tediousJsonTvpType]; CREATE TYPE [__tediousJsonTvpType] AS TABLE ([value] json NULL)', (err) => {
        if (err) {
          return done(err);
        }

        const values: unknown[] = [];
        const request = new Request('SELECT [value] FROM @tvp', (err) => {
          const dropType = new Request('DROP TYPE IF EXISTS [__tediousJsonTvpType]', (dropErr) => {
            if (err ?? dropErr) {
              return done(err ?? dropErr);
            }

            assert.deepEqual(JSON.parse(values[0] as string), { a: [1, 'ü'] });
            assert.isNull(values[1]);
            done();
          });

          connection.execSqlBatch(dropType);
        });

        request.on('row', (columns) => {
          values.push(columns[0].value);
        });

        request.addParameter('tvp', TYPES.TVP, {
          name: '__tediousJsonTvpType',
          columns: [{ name: 'value', type: TYPES.JSON }],
          rows: [
            ['{"a":[1,"ü"]}'],
            [null]
          ]
        });

        connection.execSql(request);
      });

      connection.execSqlBatch(createType);
    });
  });

  describe('on servers that do not support the json data type', function() {
    beforeEach(function() {
      if (connection.serverSupportsJson) {
        this.skip();
      }
    });

    it('fails json parameters with a descriptive error', function(done) {
      const request = new Request('SELECT @p', (err) => {
        assert.instanceOf(err, Error);
        assert.strictEqual((err as any).code, 'EJSONNOTSUPPORTED');
        done();
      });
      request.addParameter('p', TYPES.JSON, '{"a":1}');

      connection.execSql(request);
    });
  });
});
