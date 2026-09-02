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

describe('Streaming TVP', function() {
  this.timeout(60000);

  let connection: Connection;

  beforeEach(function(done) {
    connection = new Connection(config);

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    connection.connect(done);
  });

  beforeEach(function() {
    if (config.options.tdsVersion! < '7_3_A') {
      this.skip();
    }
  });

  beforeEach(function(done) {
    connection.execSqlBatch(new Request(`
      DROP PROCEDURE IF EXISTS [__tediousStreamingTvpTest];
      DROP TYPE IF EXISTS [__tediousStreamingTvpType];
      CREATE TYPE [__tediousStreamingTvpType] AS TABLE (
        id int,
        name nvarchar(100)
      )
    `, done));
  });

  beforeEach(function(done) {
    connection.execSqlBatch(new Request(`
      CREATE PROCEDURE [__tediousStreamingTvpTest] @tvp __tediousStreamingTvpType readonly AS BEGIN
        SELECT COUNT(*), SUM(CAST(id AS bigint)), MAX(id) FROM @tvp
      END
    `, done));
  });

  afterEach(function(done) {
    connection.execSqlBatch(new Request(`
      DROP PROCEDURE IF EXISTS [__tediousStreamingTvpTest];
      DROP TYPE IF EXISTS [__tediousStreamingTvpType];
    `, () => {
      connection.on('end', done);
      connection.close();
    }));
  });

  it('streams rows from an asynchronous source', function(done) {
    const rowCount = 50000;

    const request = new Request('__tediousStreamingTvpTest', function(err) {
      if (err) {
        return done(err);
      }

      assert.strictEqual(rowsPulled, rowCount);
      assert.deepEqual(result, [rowCount, String((rowCount * (rowCount - 1)) / 2), rowCount - 1]);

      done();
    });

    let result: unknown[] = [];
    request.on('row', (columns) => {
      result = columns.map((column: { value: unknown }) => column.value);
    });

    let rowsPulled = 0;
    const rows = (async function*() {
      for (let i = 0; i < rowCount; i++) {
        if (i % 1000 === 0) {
          // Simulate an asynchronous source, e.g. reading from a file or another database.
          await new Promise((resolve) => setImmediate(resolve));
        }
        rowsPulled++;
        yield [i, 'row ' + i];
      }
    })();

    request.addParameter('tvp', TYPES.TVP, {
      name: '__tediousStreamingTvpType',
      columns: [
        { name: 'id', type: TYPES.Int },
        { name: 'name', type: TYPES.NVarChar, length: 100 }
      ],
      rows
    });

    connection.callProcedure(request);
  });
});
