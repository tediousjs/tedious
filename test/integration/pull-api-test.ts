import { assert } from 'chai';
import { randomBytes } from 'crypto';
import { type Readable } from 'stream';

import { TYPES } from '../../src/tedious';
import Connection from '../../src/connection';
import Request from '../../src/request';
import { RequestError } from '../../src/errors';
import { debugOptionsFromEnv } from '../helpers/debug-options-from-env';

import defaultConfig from '../config';

function getConfig() {
  return {
    ...defaultConfig,
    options: {
      ...defaultConfig.options,
      debug: debugOptionsFromEnv(),
      tdsVersion: process.env.TEDIOUS_TDS_VERSION
    }
  };
}

async function collect(stream: Readable): Promise<Buffer> {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

describe('pulling responses', function() {
  let connection: Connection;

  beforeEach(function(done) {
    connection = new Connection(getConfig());
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

  // Run a statement via the pull API, returning all rows' values.
  async function query(sql: string) {
    const request = new Request(sql);
    connection.execSqlBatch(request);

    const rows = [];
    for await (const row of request.rows()) {
      rows.push(row.values());
    }
    return rows;
  }

  describe('rows()', function() {
    it('iterates the rows of a result set', async function() {
      const request = new Request("SELECT 1 AS id, 'a' AS name UNION ALL SELECT 2, 'b'");
      connection.execSql(request);

      const rows = [];
      for await (const row of request.rows()) {
        rows.push([row.get(0), row.get('name')]);
      }

      assert.deepEqual(rows, [[1, 'a'], [2, 'b']]);
    });

    it('completes the request once the loop ends, so the next request can be made right away', async function() {
      assert.deepEqual(await query('SELECT 1'), [[1]]);
      assert.deepEqual(await query('SELECT 2'), [[2]]);
    });

    it('iterates nothing for statements without a result set', async function() {
      assert.deepEqual(await query('DECLARE @x int = 1'), []);
      assert.deepEqual(await query('SELECT 3'), [[3]]);
    });

    it('iterates many rows spanning many packets', async function() {
      const request = new Request('SELECT TOP 20000 CAST(ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS int) AS n, REPLICATE(\'x\', 100) AS s FROM sys.all_objects a CROSS JOIN sys.all_objects b');
      connection.execSql(request);

      let expected = 1;
      for await (const row of request.rows()) {
        assert.strictEqual(row.get('n'), expected++);
      }
      assert.strictEqual(expected, 20001);
    });

    it('throws if the request returns more than one result set', async function() {
      const request = new Request('SELECT 1; SELECT 2');
      connection.execSqlBatch(request);

      let error: Error | undefined;
      const rows = [];
      try {
        for await (const row of request.rows()) {
          rows.push(row.get(0));
        }
      } catch (err: any) {
        error = err;
      }

      assert.deepEqual(rows, [1]);
      assert.match(error!.message, /more than one result set/);
      assert.deepEqual(await query('SELECT 3'), [[3]]);
    });

    it('cancels the request when the loop is stopped early', async function() {
      const request = new Request('SELECT TOP 50000 a.object_id FROM sys.all_objects a CROSS JOIN sys.all_objects b');
      connection.execSql(request);

      let count = 0;
      for await (const row of request.rows()) {
        row.get(0);
        if (++count === 10) {
          break;
        }
      }

      assert.strictEqual(count, 10);
      // The cancellation completed before the loop ended.
      assert.deepEqual(await query('SELECT 1'), [[1]]);
    });

    it('throws errors of the request from the loop, after the rows before the error', async function() {
      const request = new Request('SELECT 1; SELECT 1 / 0');
      connection.execSqlBatch(request);

      const rows = [];
      let error: Error | undefined;
      try {
        for await (const resultSet of request.results()) {
          for await (const row of resultSet) {
            rows.push(row.get(0));
          }
        }
      } catch (err: any) {
        error = err;
      }

      assert.deepEqual(rows, [1]);
      assert.instanceOf(error, RequestError);
      assert.match(error!.message, /Divide by zero/);
      assert.deepEqual(await query('SELECT 2'), [[2]]);
    });

    it('returns rows as arrays, regardless of `useColumnNames`', async function() {
      connection.close();
      connection = new Connection({ ...getConfig(), options: { ...getConfig().options, useColumnNames: true } });
      await new Promise<void>((resolve, reject) => connection.connect((err) => (err ? reject(err) : resolve())));

      assert.deepEqual(await query("SELECT 1 AS a, 'x' AS b"), [[1, 'x']]);
    });
  });

  describe('results()', function() {
    it('iterates multiple result sets', async function() {
      const request = new Request("SELECT 1 AS a; SELECT 'x' AS b, 'y' AS c UNION ALL SELECT 'z', 'w'; DECLARE @x int = 1");
      connection.execSqlBatch(request);

      const resultSets = [];
      for await (const resultSet of request.results()) {
        const rows = [];
        for await (const row of resultSet) {
          rows.push(row.values());
        }
        resultSets.push({ columns: resultSet.columns.map((c) => c.colName), rows, rowCount: resultSet.rowCount });
      }

      assert.deepEqual(resultSets, [
        { columns: ['a'], rows: [[1]], rowCount: 1 },
        { columns: ['b', 'c'], rows: [['x', 'y'], ['z', 'w']], rowCount: 2 }
      ]);
    });

    it('skips the rows of result sets that are not read', async function() {
      const request = new Request('SELECT 1 UNION ALL SELECT 2; SELECT 3');
      connection.execSqlBatch(request);

      const firstValues = [];
      for await (const resultSet of request.results()) {
        for await (const row of resultSet) {
          firstValues.push(row.get(0));
          break;
        }
      }

      assert.deepEqual(firstValues, [1, 3]);
      assert.deepEqual(await query('SELECT 4'), [[4]]);
    });
  });

  describe('streaming values', function() {
    it('streams a `varbinary(max)` value, with the values before it available right away', async function() {
      const value = randomBytes(3 * 1024 * 1024);

      const request = new Request('SELECT 42 AS id, @value AS content, 7 AS after');
      request.addParameter('value', TYPES.VarBinary, value);
      connection.execSql(request);

      for await (const row of request.rows()) {
        assert.strictEqual(row.get('id'), 42);
        assert.strictEqual(row.length('content'), value.length);

        assert.throws(() => row.get('after'), /comes after the value of `content`/);

        assert.deepEqual(await collect(row.stream('content')), value);

        assert.strictEqual(row.get('after'), 7);
        assert.throws(() => row.get('content'), /was streamed/);
      }
    });

    it('reads a streamable value in full via `read`', async function() {
      const text = 'hällo wörld '.repeat(50000);

      const request = new Request('SELECT CAST(@text AS nvarchar(max)) AS text, CAST(@bin AS varbinary(max)) AS bin');
      request.addParameter('text', TYPES.NVarChar, text);
      request.addParameter('bin', TYPES.VarBinary, Buffer.from('abc'));
      connection.execSql(request);

      for await (const row of request.rows()) {
        assert.strictEqual(await row.read('text'), text);
        assert.deepEqual(await row.read('bin'), Buffer.from('abc'));
        assert.deepEqual(row.values(), [text, Buffer.from('abc')]);
      }
    });

    it('skips unread values to read a later one', async function() {
      const request = new Request('SELECT CAST(REPLICATE(CAST(\'x\' AS varchar(max)), 100000) AS varbinary(max)) AS payload, 123 AS checksum');
      connection.execSql(request);

      for await (const row of request.rows()) {
        assert.strictEqual(await row.read('checksum'), 123);
        assert.throws(() => row.get('payload'), /was streamed/);
      }
    });

    it('streams values of many rows, and skips unread ones when moving on', async function() {
      const request = new Request("SELECT TOP 20 CAST(ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS int) AS n, CAST(REPLICATE(CAST('y' AS varchar(max)), 20000) AS varbinary(max)) AS data FROM sys.all_objects");
      connection.execSql(request);

      let count = 0;
      for await (const row of request.rows()) {
        count++;
        if (row.get('n') as number % 2 === 0) {
          assert.strictEqual((await collect(row.stream('data'))).length, 20000);
        }
      }

      assert.strictEqual(count, 20);
      assert.deepEqual(await query('SELECT 1'), [[1]]);
    });

    it('returns `null` values of streamable columns right away', async function() {
      const request = new Request('SELECT CAST(NULL AS varbinary(max)) AS a, 1 AS b');
      connection.execSql(request);

      for await (const row of request.rows()) {
        assert.deepEqual(row.values(), [null, 1]);
      }
    });
  });

  describe('output parameters', function() {
    it('reads the output parameters after the rows', async function() {
      const request = new Request('SELECT 1 AS a; SET @out = 42');
      request.addOutputParameter('out', TYPES.Int);
      connection.execSql(request);

      const rows = [];
      for await (const row of request.rows()) {
        rows.push(row.get('a'));
      }

      const output = await request.outputParameters();
      assert.deepEqual(rows, [1]);
      assert.strictEqual(output.get('out'), 42);

      assert.deepEqual(await query('SELECT 2'), [[2]]);
    });

    it('streams `max` output parameters', async function() {
      const value = randomBytes(2 * 1024 * 1024);

      const request = new Request("SET @title = 'doc'; SET @content = @value; SET @after = 1");
      request.addParameter('value', TYPES.VarBinary, value);
      request.addOutputParameter('title', TYPES.NVarChar);
      request.addOutputParameter('content', TYPES.VarBinary, undefined, { length: Infinity });
      request.addOutputParameter('after', TYPES.Int);
      connection.execSql(request);

      const output = await request.outputParameters();

      // The server returns output parameters of `max` types last, so all
      // other parameters are available right away.
      assert.strictEqual(output.get('title'), 'doc');
      assert.strictEqual(output.get('after'), 1);
      assert.strictEqual(output.length('content'), value.length);

      assert.deepEqual(await collect(output.stream('content')), value);
      assert.throws(() => output.get('content'), /was streamed/);

      assert.deepEqual(await query('SELECT 2'), [[2]]);
    });

    it('reads `max` output parameters in any order', async function() {
      const request = new Request("SET @a = REPLICATE(CAST('a' AS varchar(max)), 9000); SET @b = REPLICATE(CAST('b' AS varchar(max)), 9000)");
      request.addOutputParameter('a', TYPES.VarChar, undefined, { length: Infinity });
      request.addOutputParameter('b', TYPES.VarChar, undefined, { length: Infinity });
      connection.execSql(request);

      const output = await request.outputParameters();
      assert.strictEqual(await output.read('b'), 'b'.repeat(9000));
      assert.throws(() => output.get('a'), /was streamed/);

      assert.deepEqual(await query('SELECT 2'), [[2]]);
    });

    it('discards output parameters nobody asked for before the next request', async function() {
      const request = new Request('SELECT 1; SET @out = 42');
      request.addOutputParameter('out', TYPES.Int);
      connection.execSql(request);

      for await (const row of request.rows()) {
        row.get(0);
      }

      assert.deepEqual(await query('SELECT 2'), [[2]]);
    });
  });

  describe('finish()', function() {
    it('returns the number of affected rows', async function() {
      await query('CREATE TABLE #pull (id int)');

      const request = new Request('INSERT INTO #pull VALUES (1), (2), (3)');
      connection.execSqlBatch(request);

      const { rowCount } = await request.finish();
      assert.strictEqual(rowCount, 3);
    });

    it('returns output parameters, discarding rows', async function() {
      const request = new Request("SELECT 1; SET @a = 'x'; SET @b = REPLICATE(CAST('y' AS varchar(max)), 10000)");
      request.addOutputParameter('a', TYPES.VarChar);
      request.addOutputParameter('b', TYPES.VarChar, undefined, { length: Infinity });
      connection.execSql(request);

      const { outputParameters } = await request.finish();
      assert.deepEqual(outputParameters, { a: 'x', b: 'y'.repeat(10000) });
    });

    it('throws errors of the request', async function() {
      const request = new Request('SELECT 1 / 0');
      connection.execSql(request);

      let error: Error | undefined;
      try {
        await request.finish();
      } catch (err: any) {
        error = err;
      }

      assert.match(error!.message, /Divide by zero/);
      assert.deepEqual(await query('SELECT 2'), [[2]]);
    });
  });

  describe('misuse', function() {
    it('does not allow pulling a request that has a callback', function() {
      const request = new Request('SELECT 1', () => {});
      assert.throws(() => request.rows(), /completion callback/);
    });

    it('does not allow pulling a request that was not executed', function() {
      const request = new Request('SELECT 1');
      assert.throws(() => request.rows(), /not been executed/);
    });

    it('surfaces errors from before the request was sent', async function() {
      connection.close();

      const request = new Request('SELECT 1');
      connection.execSql(request);

      let error: Error | undefined;
      try {
        for await (const row of request.rows()) {
          row.get(0);
        }
      } catch (err: any) {
        error = err;
      }

      assert.instanceOf(error, RequestError);
    });
  });
});
