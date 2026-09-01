import { assert } from 'chai';

import Connection from '../../src/connection';
import Request from '../../src/request';
import { type ColumnInfo } from '../../src/token/token';

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

describe('Browse mode', function() {
  let connection: Connection;

  beforeEach(function(done) {
    connection = new Connection(config);

    connection.on('errorMessage', function(error) {
      console.log(`${error.number} : ${error.message}`);
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    connection.connect(done);
  });

  beforeEach(function(done) {
    const request = new Request('CREATE TABLE #browse ([id] int PRIMARY KEY, [name] nvarchar(50)); INSERT INTO #browse ([id], [name]) VALUES (1, N\'one\'), (2, N\'two\')', done);
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

  it('supports queries with a `FOR BROWSE` clause', function(done) {
    const request = new Request('SELECT [name] FROM #browse ORDER BY [id] FOR BROWSE', function(err) {
      if (err) {
        return done(err);
      }

      assert.deepEqual(values, ['one', 'two']);

      // In browse mode, the server reports the base tables of the result set
      // and appends the tables' key columns to the rows.
      assert.strictEqual(tableNames.length, 1);
      assert.isTrue(columnInfo.some((column) => column.key && column.hidden));

      done();
    });

    let tableNames: (string | string[])[] = [];
    request.on('tabName', (names) => {
      tableNames = names;
    });

    let columnInfo: ColumnInfo[] = [];
    request.on('colInfo', (columns) => {
      columnInfo = columns;
    });

    const values: unknown[] = [];
    request.on('row', (columns) => {
      values.push(columns[0].value);
    });

    connection.execSqlBatch(request);
  });

  it('supports queries with `SET NO_BROWSETABLE ON`', function(done) {
    // Regression test for a fatal `Unknown type: 164` parser error
    // (https://github.com/tediousjs/tedious/issues/410).
    const request = new Request('SET NO_BROWSETABLE ON; SELECT [id], [name] AS [alias] FROM #browse ORDER BY [id]; SET NO_BROWSETABLE OFF', function(err) {
      if (err) {
        return done(err);
      }

      assert.deepEqual(values, [1, 2]);

      assert.strictEqual(tableNames.length, 1);
      assert.isTrue(columnInfo.some((column) => column.colName === 'name'));

      done();
    });

    let tableNames: (string | string[])[] = [];
    request.on('tabName', (names) => {
      tableNames = names;
    });

    let columnInfo: ColumnInfo[] = [];
    request.on('colInfo', (columns) => {
      columnInfo = columns;
    });

    const values: unknown[] = [];
    request.on('row', (columns) => {
      values.push(columns[0].value);
    });

    connection.execSqlBatch(request);
  });
});
