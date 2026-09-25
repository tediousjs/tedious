import { assert } from 'chai';
import { randomBytes } from 'crypto';
import { Writable } from 'stream';
import { pipeline } from 'stream/promises';

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

// `max` types, and with them streamed values, exist from TDS 7.2 on.
function skipWithoutMaxTypes(context: Mocha.Context) {
  const tdsVersion = process.env.TEDIOUS_TDS_VERSION;
  if (tdsVersion !== undefined && tdsVersion < '7_2') {
    context.skip();
  }
}

async function collect(chunks: AsyncIterable<Buffer> | null): Promise<Buffer> {
  assert.isNotNull(chunks);

  const collected = [];
  for await (const chunk of chunks!) {
    collected.push(chunk);
  }
  return Buffer.concat(collected);
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
    await using response = connection.execSqlBatch(request);

    const rows = [];
    for await (const row of response.rows()) {
      rows.push(row.values());
    }
    return rows;
  }

  describe('rows()', function() {
    it('iterates the rows of a result set', async function() {
      const request = new Request("SELECT 1 AS id, 'a' AS name UNION ALL SELECT 2, 'b'");
      await using response = connection.execSql(request);

      const rows = [];
      for await (const row of response.rows()) {
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
      await using response = connection.execSql(request);

      let expected = 1;
      for await (const row of response.rows()) {
        assert.strictEqual(row.get('n'), expected++);
      }
      assert.strictEqual(expected, 20001);
    });

    it('throws if the request returns more than one result set', async function() {
      {
        const request = new Request('SELECT 1; SELECT 2');
        await using response = connection.execSqlBatch(request);

        let error: Error | undefined;
        const rows = [];
        try {
          for await (const row of response.rows()) {
            rows.push(row.get(0));
          }
        } catch (err: any) {
          error = err;
        }

        assert.deepEqual(rows, [1]);
        assert.match(error!.message, /more than one result set/);
      }

      assert.deepEqual(await query('SELECT 3'), [[3]]);
    });

    it('drains the rest of the response when the loop is stopped early', async function() {
      {
        const request = new Request('SELECT TOP 50000 a.object_id FROM sys.all_objects a CROSS JOIN sys.all_objects b');
        await using response = connection.execSql(request);

        let count = 0;
        for await (const row of response.rows()) {
          row.get(0);
          if (++count === 10) {
            break;
          }
        }

        assert.strictEqual(count, 10);

        const { rowCount } = await response.finish();
        assert.strictEqual(rowCount, 50000);
      }

      assert.deepEqual(await query('SELECT 1'), [[1]]);
    });

    it('raises errors after a loop that was stopped early from `finish`', async function() {
      const request = new Request('SELECT 1 UNION ALL SELECT 2; SELECT 1 / 0');
      const response = connection.execSqlBatch(request);

      const rows = [];
      for await (const resultSet of response.results()) {
        for await (const row of resultSet) {
          rows.push(row.get(0));
          break;
        }
        break;
      }
      assert.deepEqual(rows, [1]);

      let error: Error | undefined;
      try {
        await response.finish();
      } catch (err: any) {
        error = err;
      }

      assert.instanceOf(error, RequestError);
      assert.match(error!.message, /Divide by zero/);
      assert.deepEqual(await query('SELECT 3'), [[3]]);
    });

    it('still provides output parameters after a loop was stopped early', async function() {
      const request = new Request('SELECT 1 UNION ALL SELECT 2; SET @out = 42');
      request.addOutputParameter('out', TYPES.Int);
      await using response = connection.execSql(request);

      for await (const row of response.rows()) {
        row.get(0);
        break;
      }

      const outputParameters = await response.outputParameters();
      assert.strictEqual(outputParameters.get('out'), 42);
    });

    it('throws errors of the request from the loop, after the rows before the error', async function() {
      {
        const request = new Request('SELECT 1; SELECT 1 / 0');
        await using response = connection.execSqlBatch(request);

        const rows = [];
        let error: Error | undefined;
        try {
          for await (const resultSet of response.results()) {
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
      }

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
      await using response = connection.execSqlBatch(request);

      const resultSets = [];
      for await (const resultSet of response.results()) {
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
      {
        const request = new Request('SELECT 1 UNION ALL SELECT 2; SELECT 3');
        await using response = connection.execSqlBatch(request);

        const firstValues = [];
        for await (const resultSet of response.results()) {
          for await (const row of resultSet) {
            firstValues.push(row.get(0));
            break;
          }
        }

        assert.deepEqual(firstValues, [1, 3]);
      }

      assert.deepEqual(await query('SELECT 4'), [[4]]);
    });
  });

  describe('streaming values', function() {
    beforeEach(function() {
      skipWithoutMaxTypes(this);
    });

    it('streams a `varbinary(max)` value, with the values before it available right away', async function() {
      const value = randomBytes(3 * 1024 * 1024);

      const request = new Request('SELECT 42 AS id, @value AS content, 7 AS after');
      request.addParameter('value', TYPES.VarBinary, value);
      await using response = connection.execSql(request);

      for await (const row of response.rows()) {
        assert.strictEqual(row.get('id'), 42);
        assert.strictEqual(row.length('content'), value.length);

        assert.throws(() => row.get('after'), /comes after the value of `content`/);

        assert.deepEqual(await collect(await row.stream('content')), value);

        assert.strictEqual(row.get('after'), 7);
        assert.throws(() => row.get('content'), /was streamed/);
      }
    });

    it('reads a streamable value in full via `read`', async function() {
      const text = 'hällo wörld '.repeat(50000);

      const request = new Request('SELECT CAST(@text AS nvarchar(max)) AS text, CAST(@bin AS varbinary(max)) AS bin');
      request.addParameter('text', TYPES.NVarChar, text);
      request.addParameter('bin', TYPES.VarBinary, Buffer.from('abc'));
      await using response = connection.execSql(request);

      for await (const row of response.rows()) {
        assert.strictEqual(await row.read('text'), text);
        assert.deepEqual(await row.read('bin'), Buffer.from('abc'));
        assert.deepEqual(row.values(), [text, Buffer.from('abc')]);
      }
    });

    it('skips unread values to read a later one', async function() {
      const request = new Request('SELECT CAST(REPLICATE(CAST(\'x\' AS varchar(max)), 100000) AS varbinary(max)) AS payload, 123 AS checksum');
      await using response = connection.execSql(request);

      for await (const row of response.rows()) {
        assert.strictEqual(await row.read('checksum'), 123);
        assert.throws(() => row.get('payload'), /was streamed/);
      }
    });

    it('streams values of many rows, and skips unread ones when moving on', async function() {
      {
        const request = new Request("SELECT TOP 20 CAST(ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS int) AS n, CAST(REPLICATE(CAST('y' AS varchar(max)), 20000) AS varbinary(max)) AS data FROM sys.all_objects");
        await using response = connection.execSql(request);

        let count = 0;
        for await (const row of response.rows()) {
          count++;
          if (row.get('n') as number % 2 === 0) {
            assert.strictEqual((await collect(await row.stream('data'))).length, 20000);
          }
        }

        assert.strictEqual(count, 20);
      }

      assert.deepEqual(await query('SELECT 1'), [[1]]);
    });

    it('reads all values of a row in one call via `readValues`', async function() {
      const text = 'x'.repeat(100000);

      const request = new Request('SELECT 1 AS a, CAST(@text AS nvarchar(max)) AS b, 2 AS c, CAST(0x0102 AS varbinary(max)) AS d');
      request.addParameter('text', TYPES.NVarChar, text);
      await using response = connection.execSql(request);

      for await (const row of response.rows()) {
        assert.throws(() => row.values(), /readValues/);
        assert.deepEqual(await row.readValues(), [1, text, 2, Buffer.from([1, 2])]);
        assert.deepEqual(row.values(), [1, text, 2, Buffer.from([1, 2])]);
      }
    });

    it('does not return values that were streamed via `readValues`', async function() {
      const request = new Request('SELECT CAST(0x01 AS varbinary(max)) AS a, 1 AS b');
      await using response = connection.execSql(request);

      for await (const row of response.rows()) {
        await collect(await row.stream('a'));

        let error: Error | undefined;
        try {
          await row.readValues();
        } catch (err: any) {
          error = err;
        }
        assert.match(error!.message, /was streamed/);
      }
    });

    it('resolves `stream()` to `null` for `null` values', async function() {
      const request = new Request('SELECT CAST(0x01 AS varbinary(max)) AS a, CAST(NULL AS varbinary(max)) AS b, CAST(NULL AS varbinary(max)) AS c, 1 AS d');
      await using response = connection.execSql(request);

      for await (const row of response.rows()) {
        // `c` comes after the unread value of `a`, so it is read ahead to.
        assert.isNull(await row.stream('c'));
        assert.isNull(await row.stream('b'));
        assert.strictEqual(row.get('d'), 1);
      }
    });

    it('streams a value after skipping an unread one', async function() {
      const first = randomBytes(100000);
      const second = randomBytes(100000);

      const request = new Request('SELECT @first AS a, @second AS b');
      request.addParameter('first', TYPES.VarBinary, first);
      request.addParameter('second', TYPES.VarBinary, second);
      await using response = connection.execSql(request);

      for await (const row of response.rows()) {
        assert.deepEqual(await collect(await row.stream('b')), second);
        assert.throws(() => row.get('a'), /was streamed/);
      }
    });

    it('streams a value via `pipeline()`', async function() {
      const value = randomBytes(1024 * 1024);

      const request = new Request('SELECT @value AS content');
      request.addParameter('value', TYPES.VarBinary, value);
      await using response = connection.execSql(request);

      for await (const row of response.rows()) {
        const chunks: Buffer[] = [];
        await pipeline((await row.stream('content'))!, new Writable({
          write(chunk, encoding, callback) {
            chunks.push(chunk);
            callback();
          }
        }));

        assert.deepEqual(Buffer.concat(chunks), value);
      }
    });

    it('skips the rest of a value whose iteration was stopped early', async function() {
      const request = new Request("SELECT CAST(REPLICATE(CAST('x' AS varchar(max)), 100000) AS varbinary(max)) AS a, 1 AS b");
      await using response = connection.execSql(request);

      for await (const row of response.rows()) {
        for await (const chunk of (await row.stream('a'))!) {
          assert.isAbove(chunk.length, 0);
          break;
        }

        assert.strictEqual(await row.read('b'), 1);
      }
    });

    it('fails the iteration of a value that was skipped', async function() {
      const request = new Request("SELECT CAST(REPLICATE(CAST('x' AS varchar(max)), 100000) AS varbinary(max)) AS a, 1 AS b");
      await using response = connection.execSql(request);

      for await (const row of response.rows()) {
        const iterator = (await row.stream('a'))![Symbol.asyncIterator]();
        await iterator.next();

        assert.strictEqual(await row.read('b'), 1);

        let error: Error | undefined;
        try {
          await iterator.next();
        } catch (err: any) {
          error = err;
        }
        assert.match(error!.message, /skipped/);
      }
    });

    it('does not stream values that are not of a `max` type', async function() {
      const request = new Request('SELECT 1 AS a, CAST(NULL AS int) AS b');
      await using response = connection.execSql(request);

      for await (const row of response.rows()) {
        let error: Error | undefined;
        try {
          await row.stream('b');
        } catch (err: any) {
          error = err;
        }
        assert.match(error!.message, /not of a `max` type/);
      }
    });

    it('returns `null` values of streamable columns right away', async function() {
      const request = new Request('SELECT CAST(NULL AS varbinary(max)) AS a, 1 AS b');
      await using response = connection.execSql(request);

      for await (const row of response.rows()) {
        assert.deepEqual(row.values(), [null, 1]);
      }
    });
  });

  describe('output parameters', function() {
    it('reads the output parameters after the rows', async function() {
      {
        const request = new Request('SELECT 1 AS a; SET @out = 42');
        request.addOutputParameter('out', TYPES.Int);
        await using response = connection.execSql(request);

        const rows = [];
        for await (const row of response.rows()) {
          rows.push(row.get('a'));
        }

        const output = await response.outputParameters();
        assert.deepEqual(rows, [1]);
        assert.strictEqual(output.get('out'), 42);
      }

      assert.deepEqual(await query('SELECT 2'), [[2]]);
    });

    it('streams `max` output parameters', async function() {
      skipWithoutMaxTypes(this);

      const value = randomBytes(2 * 1024 * 1024);

      {
        const request = new Request("SET @title = 'doc'; SET @content = @value; SET @after = 1");
        request.addParameter('value', TYPES.VarBinary, value);
        request.addOutputParameter('title', TYPES.NVarChar);
        request.addOutputParameter('content', TYPES.VarBinary, undefined, { length: Infinity });
        request.addOutputParameter('after', TYPES.Int);
        await using response = connection.execSql(request);

        const output = await response.outputParameters();

        // The server returns output parameters of `max` types last, so all
        // other parameters are available right away.
        assert.strictEqual(output.get('title'), 'doc');
        assert.strictEqual(output.get('after'), 1);
        assert.strictEqual(output.length('content'), value.length);

        assert.deepEqual(await collect(await output.stream('content')), value);
        assert.throws(() => output.get('content'), /was streamed/);
      }

      assert.deepEqual(await query('SELECT 2'), [[2]]);
    });

    it('resolves `stream()` of a `null` output parameter to `null`', async function() {
      skipWithoutMaxTypes(this);

      const request = new Request('SET @a = NULL');
      request.addOutputParameter('a', TYPES.VarBinary, undefined, { length: Infinity });
      await using response = connection.execSql(request);

      const output = await response.outputParameters();
      assert.isNull(await output.stream('a'));
    });

    it('reads `max` output parameters in any order', async function() {
      skipWithoutMaxTypes(this);

      {
        const request = new Request("SET @a = REPLICATE(CAST('a' AS varchar(max)), 9000); SET @b = REPLICATE(CAST('b' AS varchar(max)), 9000)");
        request.addOutputParameter('a', TYPES.VarChar, undefined, { length: Infinity });
        request.addOutputParameter('b', TYPES.VarChar, undefined, { length: Infinity });
        await using response = connection.execSql(request);

        const output = await response.outputParameters();
        assert.strictEqual(await output.read('b'), 'b'.repeat(9000));
        assert.throws(() => output.get('a'), /was streamed/);
      }

      assert.deepEqual(await query('SELECT 2'), [[2]]);
    });

    it('discards output parameters nobody asked for when finished', async function() {
      {
        const request = new Request('SELECT 1; SET @out = 42');
        request.addOutputParameter('out', TYPES.Int);
        await using response = connection.execSql(request);

        for await (const row of response.rows()) {
          row.get(0);
        }
      }

      assert.deepEqual(await query('SELECT 2'), [[2]]);
    });
  });

  describe('finish()', function() {
    it('returns the number of affected rows', async function() {
      await query('CREATE TABLE #pull (id int)');

      const request = new Request('INSERT INTO #pull VALUES (1), (2), (3)');
      await using response = connection.execSqlBatch(request);

      const { rowCount } = await response.finish();
      assert.strictEqual(rowCount, 3);
    });

    it('returns output parameters, discarding rows', async function() {
      skipWithoutMaxTypes(this);

      const request = new Request("SELECT 1; SET @a = 'x'; SET @b = REPLICATE(CAST('y' AS varchar(max)), 10000)");
      request.addOutputParameter('a', TYPES.VarChar);
      request.addOutputParameter('b', TYPES.VarChar, undefined, { length: Infinity });
      await using response = connection.execSql(request);

      const { outputParameters } = await response.finish();
      assert.deepEqual(outputParameters, { a: 'x', b: 'y'.repeat(10000) });
    });

    it('throws errors of the request', async function() {
      {
        const request = new Request('SELECT 1 / 0');
        await using response = connection.execSql(request);

        let error: Error | undefined;
        try {
          await response.finish();
        } catch (err: any) {
          error = err;
        }

        assert.match(error!.message, /Divide by zero/);
      }

      assert.deepEqual(await query('SELECT 2'), [[2]]);
    });
  });

  describe('finishing', function() {
    it('requires a request to be finished before the next one', async function() {
      const request = new Request('SELECT 1');
      await using response = connection.execSql(request);

      for await (const row of response.rows()) {
        row.get(0);
      }

      let error: Error | undefined;
      try {
        await query('SELECT 2');
      } catch (err: any) {
        error = err;
      }
      assert.match(error!.message, /previous request was not finished/);

      await response.finish();
      assert.deepEqual(await query('SELECT 3'), [[3]]);
    });

    it('finishes a request declared with `await using` when it goes out of scope', async function() {
      {
        const request = new Request('SELECT 1 UNION ALL SELECT 2');
        await using response = connection.execSql(request);

        for await (const row of response.rows()) {
          row.get(0);
          break;
        }
      }

      assert.deepEqual(await query('SELECT 3'), [[3]]);
    });

    it('finishes a request when its scope is left via an exception', async function() {
      let error: Error | undefined;
      try {
        const request = new Request('SELECT TOP 10000 a.object_id FROM sys.all_objects a CROSS JOIN sys.all_objects b');
        await using response = connection.execSql(request);

        for await (const row of response.rows()) {
          row.get(0);
          throw new Error('boom');
        }
      } catch (err: any) {
        error = err;
      }

      assert.strictEqual(error!.message, 'boom');
      assert.deepEqual(await query('SELECT 3'), [[3]]);
    });

    it('raises errors of a request that was never read when it goes out of scope', async function() {
      let error: Error | undefined;
      try {
        const request = new Request('SELECT 1 / 0');
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- only disposed
        await using response = connection.execSql(request);
      } catch (err: any) {
        error = err;
      }

      assert.instanceOf(error, RequestError);
      assert.match(error!.message, /Divide by zero/);
      assert.deepEqual(await query('SELECT 3'), [[3]]);
    });

    it('raises errors of a response whose rows were never iterated when it goes out of scope', async function() {
      let error: Error | undefined;
      try {
        const request = new Request('SELECT 1 / 0');
        await using response = connection.execSql(request);
        response.rows();
      } catch (err: any) {
        error = err;
      }

      assert.instanceOf(error, RequestError);
      assert.match(error!.message, /Divide by zero/);
      assert.deepEqual(await query('SELECT 3'), [[3]]);
    });

    it('raises both errors if the scope is left via an exception while the request failed', async function() {
      let error: any;
      try {
        const request = new Request('SELECT 1 / 0');
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- only disposed
        await using response = connection.execSql(request);
        throw new Error('boom');
      } catch (err: any) {
        error = err;
      }

      // Node.js 22 does not provide `SuppressedError` itself, so check the
      // error's shape rather than its class.
      assert.strictEqual(error.name, 'SuppressedError');
      assert.match(error.error.message, /Divide by zero/);
      assert.strictEqual(error.suppressed.message, 'boom');
      assert.deepEqual(await query('SELECT 3'), [[3]]);
    });

    it('does not raise errors again that a loop already raised', async function() {
      const request = new Request('SELECT 1 / 0');
      await using response = connection.execSql(request);

      let error: Error | undefined;
      try {
        for await (const row of response.rows()) {
          row.get(0);
        }
      } catch (err: any) {
        error = err;
      }
      assert.match(error!.message, /Divide by zero/);

      const { rowCount } = await response.finish();
      assert.strictEqual(rowCount, 0);
    });

    it('returns the same summary when finished repeatedly', async function() {
      const request = new Request('SELECT 1 UNION ALL SELECT 2');
      await using response = connection.execSql(request);

      for await (const row of response.rows()) {
        row.get(0);
      }

      assert.deepEqual(await response.finish(), { rowCount: 2, returnStatus: 0, outputParameters: {} });
      assert.deepEqual(await response.finish(), { rowCount: 2, returnStatus: 0, outputParameters: {} });
    });
  });

  describe('prepared statements', function() {
    it('executes a prepared statement repeatedly, and unprepares it when it goes out of scope', async function() {
      const request = new Request('SELECT @id * 10 AS value');
      request.addParameter('id', TYPES.Int);

      const values = [];
      {
        await using statement = await connection.prepare(request);
        assert.isNumber(statement.handle);

        for (const id of [1, 2, 3]) {
          await using response = statement.execute({ id });
          for await (const row of response.rows()) {
            values.push(row.get('value'));
          }
        }
      }

      assert.deepEqual(values, [10, 20, 30]);
      assert.deepEqual(await query('SELECT 4'), [[4]]);
    });

    it('finishes the latest execution before unpreparing', async function() {
      const request = new Request('SELECT @id AS value UNION ALL SELECT @id + 1');
      request.addParameter('id', TYPES.Int);

      {
        await using statement = await connection.prepare(request);

        const response = statement.execute({ id: 1 });
        for await (const row of response.rows()) {
          row.get(0);
          break;
        }

        // The response is not finished here - unpreparing the statement
        // finishes it.
      }

      assert.deepEqual(await query('SELECT 4'), [[4]]);
    });

    it('returns output parameters of executions', async function() {
      const request = new Request('SET @out = @in * 2');
      request.addParameter('in', TYPES.Int);
      request.addOutputParameter('out', TYPES.Int);

      const outputs = [];
      {
        await using statement = await connection.prepare(request);

        for (const value of [10, 21]) {
          await using response = statement.execute({ in: value });
          outputs.push((await response.outputParameters()).get('out'));
        }
      }

      assert.deepEqual(outputs, [20, 42]);
      assert.strictEqual(request.listenerCount('returnValue'), 0);
    });

    it('does not allow executing a statement that was unprepared', async function() {
      const request = new Request('SELECT 1');

      const statement = await connection.prepare(request);
      await statement.unprepare();

      assert.throws(() => statement.execute(), /unprepared/);
      assert.deepEqual(await query('SELECT 4'), [[4]]);
    });

    it('rejects if the statement can not be prepared', async function() {
      let error: any;
      try {
        await connection.prepare(new Request('SELECT * FROM table_that_does_not_exist'));
      } catch (err: any) {
        error = err;
      }

      assert.instanceOf(error, AggregateError);
      assert.match(error.errors[0].message, /Invalid object name/);
      assert.deepEqual(await query('SELECT 4'), [[4]]);
    });

    it('raises errors that only occur when executing the statement from the loop', async function() {
      // `sp_prepare` accepts this, but the statement fails to execute (as a
      // call of a procedure named `SELEC`).
      await using statement = await connection.prepare(new Request('SELEC nothing'));

      let error: Error | undefined;
      try {
        await using response = statement.execute();
        for await (const row of response.rows()) {
          row.get(0);
        }
      } catch (err: any) {
        error = err;
      }

      assert.instanceOf(error, RequestError);
      assert.match(error!.message, /Could not find stored procedure/);
    });

    it('can be executed again after a loop over an execution was stopped early', async function() {
      const request = new Request('SELECT TOP 5000 a.object_id FROM sys.all_objects a CROSS JOIN sys.all_objects b');

      await using statement = await connection.prepare(request);
      for (let i = 0; i < 2; i++) {
        await using response = statement.execute();
        for await (const row of response.rows()) {
          row.get(0);
          break;
        }
      }
    });
  });

  describe('abort signals', function() {
    const MANY_ROWS = 'SELECT TOP 50000 a.object_id FROM sys.all_objects a CROSS JOIN sys.all_objects b';

    it('cancels a request whose signal is aborted while its rows are read', async function() {
      const controller = new AbortController();
      const reason = new Error('stop');

      {
        await using response = connection.execSql(new Request(MANY_ROWS), { signal: controller.signal });

        let count = 0;
        let error: unknown;
        try {
          for await (const row of response.rows()) {
            row.get(0);
            if (++count === 10) {
              controller.abort(reason);
            }
          }
        } catch (err) {
          error = err;
        }

        assert.strictEqual(error, reason);
        assert.isBelow(count, 50000);
      }

      assert.deepEqual(await query('SELECT 1'), [[1]]);
    });

    it('does not raise the reason again when disposing an aborted response', async function() {
      const controller = new AbortController();

      let error: any;
      try {
        await using response = connection.execSql(new Request(MANY_ROWS), { signal: controller.signal });

        try {
          for await (const row of response.rows()) {
            row.get(0);
            throw new Error('boom');
          }
        } catch (err) {
          controller.abort(err);
          throw err;
        }
      } catch (err) {
        error = err;
      }

      assert.strictEqual(error.message, 'boom');
      assert.deepEqual(await query('SELECT 1'), [[1]]);
    });

    it('does not drain the rest of the response after a loop was stopped early', async function() {
      const controller = new AbortController();
      const response = connection.execSql(new Request(MANY_ROWS), { signal: controller.signal });

      for await (const row of response.rows()) {
        row.get(0);
        break;
      }

      controller.abort();

      let error: any;
      try {
        await response.finish();
      } catch (err) {
        error = err;
      }

      assert.strictEqual(error.name, 'AbortError');
      assert.isBelow(response.request.rowCount!, 50000);
      assert.deepEqual(await query('SELECT 1'), [[1]]);
    });

    it('does not send a request whose signal was aborted already', async function() {
      const reason = new Error('stop');
      const response = connection.execSql(new Request('SELECT 1'), { signal: AbortSignal.abort(reason) });

      let error: unknown;
      try {
        await response.finish();
      } catch (err) {
        error = err;
      }

      assert.strictEqual(error, reason);
      assert.deepEqual(await query('SELECT 1'), [[1]]);
    });

    it('fails with a timeout signal\'s reason', async function() {
      const response = connection.execSql(new Request("WAITFOR DELAY '00:00:05'"), { signal: AbortSignal.timeout(100) });

      let error: any;
      try {
        await response.finish();
      } catch (err) {
        error = err;
      }

      assert.strictEqual(error.name, 'TimeoutError');
      assert.deepEqual(await query('SELECT 1'), [[1]]);
    });

    it('ignores signals aborted after the request completed', async function() {
      const controller = new AbortController();
      const response = connection.execSql(new Request('SELECT 1'), { signal: controller.signal });

      const { rowCount } = await response.finish();
      controller.abort();

      assert.strictEqual(rowCount, 1);
      assert.deepEqual(await query('SELECT 1'), [[1]]);
    });

    it('cancels an execution of a prepared statement', async function() {
      const request = new Request(MANY_ROWS);
      await using statement = await connection.prepare(request);

      const controller = new AbortController();
      const reason = new Error('stop');
      {
        await using response = statement.execute({}, { signal: controller.signal });

        let error: unknown;
        try {
          for await (const row of response.rows()) {
            row.get(0);
            controller.abort(reason);
          }
        } catch (err) {
          error = err;
        }

        assert.strictEqual(error, reason);
      }

      const { rowCount } = await statement.execute().finish();
      assert.strictEqual(rowCount, 50000);
    });

    it('cancels requests with a completion callback', async function() {
      const controller = new AbortController();

      const error = await new Promise<Error | null | undefined>((resolve) => {
        const request = new Request("WAITFOR DELAY '00:00:05'", (err) => { resolve(err); });
        connection.execSql(request, { signal: controller.signal });
        setTimeout(() => { controller.abort(); }, 100);
      });

      assert.instanceOf(error, RequestError);
      assert.strictEqual((error as RequestError).code, 'ECANCEL');
      assert.deepEqual(await query('SELECT 1'), [[1]]);
    });
  });

  describe('misuse', function() {
    it('returns no response for a request that has a callback', async function() {
      let completed!: () => void;
      const completion = new Promise<void>((resolve) => { completed = resolve; });

      const request = new Request('SELECT 1', () => { completed(); });
      const response: void = connection.execSql(request);

      assert.isUndefined(response);
      await completion;
    });

    it('surfaces errors from before the request was sent', async function() {
      connection.close();

      const request = new Request('SELECT 1');
      await using response = connection.execSql(request);

      let error: Error | undefined;
      try {
        for await (const row of response.rows()) {
          row.get(0);
        }
      } catch (err: any) {
        error = err;
      }

      assert.instanceOf(error, RequestError);
    });
  });
});
