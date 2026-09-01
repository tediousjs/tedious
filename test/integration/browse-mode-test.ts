import { assert } from 'chai';

import Connection from '../../src/connection';
import Request from '../../src/request';
import { typeByName as TYPES } from '../../src/data-type';
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

// Table names are reported as their individual parts, with the table's own
// name as the last part.
function lastPart(tableName: string[]): string {
  return tableName[tableName.length - 1];
}

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

    let tableNames: string[][] = [];
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

  it('reports the base tables of joined columns', function(done) {
    const request = new Request('CREATE TABLE #other ([id] int PRIMARY KEY, [title] nvarchar(50)); INSERT INTO #other VALUES (1, N\'first\'); SELECT b.[name], o.[title] FROM #browse b JOIN #other o ON o.[id] = b.[id] FOR BROWSE', function(err) {
      if (err) {
        return done(err);
      }

      assert.sameMembers(tableNames.map(lastPart), ['#browse', '#other']);

      // The two selected columns map to the two different base tables.
      const visible = columnInfo.filter((column) => !column.hidden);
      assert.deepEqual(visible.map((column) => column.tableNum), [1, 2]);

      // The server appends the key columns of both base tables.
      const hiddenKeyTables = columnInfo.filter((column) => column.key && column.hidden).map((column) => column.tableNum);
      assert.sameMembers(hiddenKeyTables, [1, 2]);

      done();
    });

    let tableNames: string[][] = [];
    request.on('tabName', (names) => {
      tableNames = names;
    });

    let columnInfo: ColumnInfo[] = [];
    request.on('colInfo', (columns) => {
      columnInfo = columns;
    });

    connection.execSqlBatch(request);
  });

  it('flags expression columns, also for parameterised statements', function(done) {
    const request = new Request('SELECT [id] + @delta AS [shifted] FROM #browse FOR BROWSE', function(err) {
      if (err) {
        return done(err);
      }

      assert.deepEqual(values, [11, 12]);

      // The expression column belongs to no base table.
      assert.isTrue(columnInfo.some((column) => column.expression && column.tableNum === 0));
      // The base table's key column is still appended.
      assert.isTrue(columnInfo.some((column) => column.key && column.hidden && column.tableNum === 1));

      done();
    });

    request.addParameter('delta', TYPES.Int, 10);

    let columnInfo: ColumnInfo[] = [];
    request.on('colInfo', (columns) => {
      columnInfo = columns;
    });

    const values: unknown[] = [];
    request.on('row', (columns) => {
      values.push(columns[0].value);
    });

    connection.execSql(request);
  });

  it('supports API cursors created via `sp_cursoropen`', function(done) {
    const request = new Request('DECLARE @cursor int; EXEC sp_cursoropen @cursor OUTPUT, N\'SELECT [id], [name] FROM #browse\', 2, 8193; EXEC sp_cursorfetch @cursor, 2, 0, 2; EXEC sp_cursorclose @cursor', function(err) {
      if (err) {
        return done(err);
      }

      // Both the cursor open and the fetch report the result set's base tables.
      assert.isAtLeast(tableNames.length, 1);
      assert.strictEqual(columnInfo.length, tableNames.length);

      for (const names of tableNames) {
        assert.deepEqual(names.map(lastPart), ['#browse']);
      }

      for (const columns of columnInfo) {
        assert.isTrue(columns.some((column) => column.key && column.tableNum === 1));
      }

      done();
    });

    const tableNames: string[][][] = [];
    request.on('tabName', (names) => {
      tableNames.push(names);
    });

    const columnInfo: ColumnInfo[][] = [];
    request.on('colInfo', (columns) => {
      columnInfo.push(columns);
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

    let tableNames: string[][] = [];
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
