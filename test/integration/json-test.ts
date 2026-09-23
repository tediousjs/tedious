import { assert } from 'chai';
import { Readable } from 'stream';

import Connection from '../../src/connection';
import Request from '../../src/request';
import { RequestError } from '../../src/errors';
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

// "Type json is not a defined system type."
const UNDEFINED_TYPE_ERROR = 243;

describe('json data type', function() {
  let connection: Connection;

  // Whether JSONSUPPORT is expected to be negotiated, decided without
  // looking at `serverSupportsJson`, which is what is under test: the server
  // has the `json` data type, and JSONSUPPORT was requested at login, which
  // requires TDS 7.4.
  let expectJsonSupport: boolean;

  before(function(done) {
    const probeConnection = new Connection(config);

    probeConnection.connect((err) => {
      if (err) {
        return done(err);
      }

      const request = new Request('SELECT CAST(\'{}\' AS json)', (err) => {
        probeConnection.close();

        if (err && !(err instanceof RequestError && err.number === UNDEFINED_TYPE_ERROR)) {
          return done(err);
        }

        const tdsVersionSupportsJson = !config.options.tdsVersion || config.options.tdsVersion >= '7_4';
        expectJsonSupport = !err && tdsVersionSupportsJson;
        done();
      });

      probeConnection.execSql(request);
    });
  });

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

  it('negotiates JSON support exactly when the server has the json data type', function() {
    assert.strictEqual(connection.serverSupportsJson, expectJsonSupport);
  });

  describe('on servers that support the json data type', function() {
    beforeEach(function() {
      if (!expectJsonSupport) {
        this.skip();
      }
    });

    // Runs `sql` with the given parameters and returns the first column of
    // every row.
    function query(sql: string, addParameters: (request: Request) => void, callback: (err: Error | null | undefined, values: unknown[], types: string[]) => void) {
      const values: unknown[] = [];
      const types: string[] = [];

      const request = new Request(sql, (err) => {
        callback(err, values, types);
      });
      addParameters(request);

      request.on('row', (columns) => {
        values.push(columns[0].value);
        types.push(columns[0].metadata.type.name);
      });

      connection.execSql(request);
    }

    it('returns json columns as strings', function(done) {
      query('SELECT CAST(\'{"a":[1,"ü"]}\' AS json)', () => {}, (err, values, types) => {
        if (err) {
          return done(err);
        }

        assert.deepEqual(types, ['JSON']);
        assert.isString(values[0]);
        assert.deepEqual(JSON.parse(values[0] as string), { a: [1, 'ü'] });
        done();
      });
    });

    it('returns null json values as `null`', function(done) {
      query('SELECT CAST(NULL AS json)', () => {}, (err, values, types) => {
        if (err) {
          return done(err);
        }

        assert.deepEqual(types, ['JSON']);
        assert.deepEqual(values, [null]);
        done();
      });
    });

    it('round-trips string parameter values', function(done) {
      const value = '{"a":[1,"ü"],"b":null}';

      query('SELECT @p', (request) => {
        request.addParameter('p', TYPES.JSON, value);
      }, (err, values) => {
        if (err) {
          return done(err);
        }

        assert.lengthOf(values, 1);
        assert.deepEqual(JSON.parse(values[0] as string), JSON.parse(value));
        done();
      });
    });

    it('round-trips object parameter values', function(done) {
      const value = { a: [1, 'ü'], b: null };

      query('SELECT @p', (request) => {
        request.addParameter('p', TYPES.JSON, value);
      }, (err, values) => {
        if (err) {
          return done(err);
        }

        assert.lengthOf(values, 1);
        assert.deepEqual(JSON.parse(values[0] as string), value);
        done();
      });
    });

    it('round-trips `null` parameter values', function(done) {
      query('SELECT @p', (request) => {
        request.addParameter('p', TYPES.JSON, null);
      }, (err, values) => {
        if (err) {
          return done(err);
        }

        assert.deepEqual(values, [null]);
        done();
      });
    });

    it('round-trips parameter values read from a stream', function(done) {
      const value = { a: 'ü'.repeat(10000), b: [1, 2, 3] };
      const text = JSON.stringify(value);
      const source = Readable.from([text.slice(0, 5000), text.slice(5000, 15000), text.slice(15000)]);

      query('SELECT @p', (request) => {
        request.addParameter('p', TYPES.JSON, source);
      }, (err, values) => {
        if (err) {
          return done(err);
        }

        assert.lengthOf(values, 1);
        assert.deepEqual(JSON.parse(values[0] as string), value);
        done();
      });
    });

    it('rejects string parameter values that are not valid JSON text', function(done) {
      query('SELECT @p', (request) => {
        request.addParameter('p', TYPES.JSON, 'not json');
      }, (err, values) => {
        assert.instanceOf(err, RequestError);
        assert.lengthOf(values, 0);
        done();
      });
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

          assert.lengthOf(values, 3);
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

            assert.lengthOf(values, 2);
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

    it('returns json values for output parameters', function(done) {
      let returnValueReceived = false;

      const request = new Request('SET @out = @in', (err) => {
        if (err) {
          return done(err);
        }

        assert.isTrue(returnValueReceived);
        done();
      });

      request.addParameter('in', TYPES.JSON, '{"a":[1,"ü"]}');
      request.addOutputParameter('out', TYPES.JSON);

      request.on('returnValue', (name, value, metadata) => {
        assert.strictEqual(name, 'out');
        assert.deepEqual(JSON.parse(value as string), { a: [1, 'ü'] });
        assert.strictEqual(metadata.type.name, 'JSON');
        returnValueReceived = true;
      });

      connection.execSql(request);
    });

    it('returns `null` for json output parameters set to `null`', function(done) {
      let returnValueReceived = false;

      const request = new Request('SET @out = NULL', (err) => {
        if (err) {
          return done(err);
        }

        assert.isTrue(returnValueReceived);
        done();
      });

      request.addOutputParameter('out', TYPES.JSON);

      request.on('returnValue', (name, value, metadata) => {
        assert.strictEqual(name, 'out');
        assert.isNull(value);
        assert.strictEqual(metadata.type.name, 'JSON');
        returnValueReceived = true;
      });

      connection.execSql(request);
    });
  });

  describe('on servers that do not support the json data type', function() {
    beforeEach(function() {
      if (expectJsonSupport) {
        this.skip();
      }
    });

    it('fails json parameters with a descriptive error', function(done) {
      const request = new Request('SELECT @p', (err) => {
        assert.instanceOf(err, Error);
        assert.strictEqual((err as any).code, 'EJSONNOTSUPPORTED');

        if (config.options.tdsVersion && config.options.tdsVersion < '7_4') {
          // JSON support was never negotiated because of the configured TDS
          // version - the error should point at that, not at the server.
          assert.include((err as Error).message, 'tdsVersion');
        } else {
          assert.include((err as Error).message, 'SQL Server 2025');
        }

        done();
      });
      request.addParameter('p', TYPES.JSON, '{"a":1}');

      connection.execSql(request);
    });
  });
});
