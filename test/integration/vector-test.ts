import { assert } from 'chai';

import Connection, { type ConnectionConfiguration } from '../../src/connection';
import Request from '../../src/request';
import { TYPES } from '../../src/data-type';
import { RequestError } from '../../src/errors';
import { fromFloat16Bits, toFloat16Bits } from '../../src/data-types/vector';
import { debugOptionsFromEnv } from '../helpers/debug-options-from-env';

import defaultConfig from '../config';

function getConfig(options: ConnectionConfiguration['options'] = {}): ConnectionConfiguration {
  return {
    ...defaultConfig,
    options: {
      ...defaultConfig.options,
      debug: debugOptionsFromEnv(),
      tdsVersion: process.env.TEDIOUS_TDS_VERSION,
      ...options
    }
  };
}

function connect(options: ConnectionConfiguration['options'] = {}): Promise<Connection> {
  const connection = new Connection(getConfig(options));
  if (process.env.TEDIOUS_DEBUG) {
    connection.on('debug', console.log);
  }

  return new Promise((resolve, reject) => {
    connection.connect((err) => (err ? reject(err) : resolve(connection)));
  });
}

function close(connection: Connection | undefined): Promise<void> {
  if (!connection || connection.closed) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    connection.on('end', resolve);
    connection.close();
  });
}

interface Column {
  value: any;
  type: string;
  precision: number | undefined;
  dataLength: number | undefined;
}

interface Result {
  rows: Column[][];
  outputs: { [name: string]: unknown };
}

function run(connection: Connection, method: 'execSql' | 'execSqlBatch' | 'callProcedure', sql: string, addParameters: (request: Request) => void = () => {}): Promise<Result> {
  return new Promise((resolve, reject) => {
    const result: Result = { rows: [], outputs: {} };
    const request = new Request(sql, (err) => (err ? reject(err) : resolve(result)));
    request.on('row', (columns: Array<{ value: unknown, metadata: { type: { name: string }, precision: number | undefined, dataLength: number | undefined } }>) => {
      result.rows.push(columns.map((column) => ({ value: column.value, type: column.metadata.type.name, precision: column.metadata.precision, dataLength: column.metadata.dataLength })));
    });
    request.on('returnValue', (name: string, value: unknown) => {
      result.outputs[name] = value;
    });
    addParameters(request);
    connection[method](request);
  });
}

function execSql(connection: Connection, sql: string, addParameters?: (request: Request) => void) {
  return run(connection, 'execSql', sql, addParameters);
}

function execSqlBatch(connection: Connection, sql: string) {
  return run(connection, 'execSqlBatch', sql);
}

async function rejection(promise: Promise<unknown>): Promise<Error & { code?: string, number?: number }> {
  try {
    await promise;
  } catch (err) {
    return err as Error;
  }
  assert.fail('Expected the promise to be rejected');
}

function values(result: Result) {
  return result.rows.map((row) => row.map((column) => column.value));
}

function float16(numbers: number[]) {
  return numbers.map((number) => fromFloat16Bits(toFloat16Bits(number)));
}

// The server's JSON text of a vector, e.g. `[1.0000000e+000,2.5000000e+000]`.
function parseVectorText(text: string): number[] {
  return JSON.parse(text);
}

describe('Vector data type', function() {
  this.timeout(60000);

  let connection: Connection;
  let serverSupportsVector: boolean;
  // Whether `vector(n, float16)` can be declared in the current database.
  let serverSupportsFloat16: boolean;

  before(async function() {
    const probe = await connect();
    try {
      // Decided independently of the negotiation under test.
      const result = await execSqlBatch(probe, "SELECT COUNT(*) FROM sys.types WHERE name = 'vector' AND is_user_defined = 0");
      serverSupportsVector = result.rows[0][0].value === 1;

      serverSupportsFloat16 = false;
      if (serverSupportsVector) {
        try {
          await execSqlBatch(probe, "EXEC('DECLARE @v vector(1, float16) = ''[1]''')");
          serverSupportsFloat16 = true;
        } catch {
          // PREVIEW_FEATURES is not enabled in this database.
        }
      }
    } finally {
      await close(probe);
    }
  });

  beforeEach(async function() {
    connection = await connect();
  });

  afterEach(async function() {
    await close(connection);
  });

  describe('on servers without the `vector` data type', function() {
    beforeEach(function() {
      if (serverSupportsVector) {
        this.skip();
      }
    });

    it('does not negotiate vector support', function() {
      assert.strictEqual(connection.vectorSupportVersion, 0);
    });

    it('rejects vector parameters without sending them', async function() {
      const error = await rejection(execSql(connection, 'SELECT @v', (request) => request.addParameter('v', TYPES.Vector, [1, 2])));
      assert.instanceOf(error, RequestError);
      assert.strictEqual(error.code, 'EVECTORNOTSUPPORTED');

      // The connection is still usable.
      assert.deepEqual(values(await execSql(connection, 'SELECT 1')), [[1]]);
    });
  });

  describe('on servers with the `vector` data type', function() {
    beforeEach(function() {
      if (!serverSupportsVector) {
        this.skip();
      }
    });

    it('negotiates vector support on TDS 7.4', function() {
      if (connection.config.options.tdsVersion < '7_4') {
        assert.strictEqual(connection.vectorSupportVersion, 0);
      } else {
        assert.isAtLeast(connection.vectorSupportVersion, 1);
      }
    });

    // The highest version a server supports can only be learned through the
    // negotiation under test, so it is declared per test server. Without the
    // declaration, a server that stopped negotiating version 2 would only move
    // the float16 tests from the version 2 to the version 1 expectations below.
    it('negotiates the vector support version declared in TEDIOUS_VECTOR_SUPPORT_VERSION', function() {
      const expected = process.env.TEDIOUS_VECTOR_SUPPORT_VERSION;
      if (expected === undefined || connection.config.options.tdsVersion < '7_4') {
        this.skip();
      }

      assert.strictEqual(connection.vectorSupportVersion, Number(expected));
    });

    describe('with vector support negotiated', function() {
      beforeEach(function() {
        if (connection.vectorSupportVersion < 1) {
          this.skip();
        }
      });

      describe('reading', function() {
        for (const method of ['execSql', 'execSqlBatch'] as const) {
          it(`returns vector columns as arrays of numbers (${method})`, async function() {
            const result = await run(connection, method, `
              SELECT
                CAST('[1, 2.5, -3]' AS vector(3)) AS v3,
                CAST('[0.1]' AS vector(1)) AS v1,
                CAST(NULL AS vector(2)) AS n,
                42 AS i,
                N'text' AS s,
                CAST('[4, 5]' AS vector(2)) AS v2
            `);

            assert.deepEqual(values(result), [[[1, 2.5, -3], [Math.fround(0.1)], null, 42, 'text', [4, 5]]]);
            const [v3, v1, n, , , v2] = result.rows[0];
            assert.deepInclude(v3, { type: 'Vector', precision: 3, dataLength: 20 });
            assert.deepInclude(v1, { type: 'Vector', precision: 1, dataLength: 12 });
            assert.deepInclude(n, { type: 'Vector', precision: 2, dataLength: 16 });
            assert.deepInclude(v2, { type: 'Vector', precision: 2, dataLength: 16 });
          });
        }

        it('returns vectors with the maximum number of dimensions', async function() {
          const result = await execSqlBatch(connection, `
            SELECT CAST('[' + STRING_AGG(CAST(value AS varchar(max)), ',') WITHIN GROUP (ORDER BY value) + ']' AS vector(1998))
            FROM GENERATE_SERIES(1, 1998)
          `);

          const [[column]] = result.rows;
          assert.strictEqual(column.precision, 1998);
          assert.strictEqual(column.dataLength, 8000);
          assert.deepEqual(column.value, Array.from({ length: 1998 }, (_, i) => i + 1));
        });

        it('returns many rows with vector columns', async function() {
          const result = await execSqlBatch(connection, `
            SELECT value, CAST(JSON_ARRAY(value, -value, value / 2.0) AS vector(3))
            FROM GENERATE_SERIES(1, 2000)
            ORDER BY value
          `);

          assert.lengthOf(result.rows, 2000);
          result.rows.forEach(([id, vector], i) => {
            assert.strictEqual(id.value, i + 1);
            assert.deepEqual(vector.value, [i + 1, -(i + 1), (i + 1) / 2]);
          });
        });

        it('returns the same values as the server\'s JSON conversion', async function() {
          const result = await execSqlBatch(connection, `
            DECLARE @v vector(5) = '[0.1, -123.456, 3.4e38, 1e-38, 6.02214076e23]';
            SELECT @v, CAST(@v AS nvarchar(max));
          `);

          const [[vector, text]] = result.rows;
          assert.deepEqual(vector.value, parseVectorText(text.value).map(Math.fround));
          assert.deepEqual(vector.value, [0.1, -123.456, 3.4e38, 1e-38, 6.02214076e23].map(Math.fround));
        });
      });

      describe('writing', function() {
        beforeEach(async function() {
          await execSqlBatch(connection, `
            DROP TABLE IF EXISTS #vectors;
            CREATE TABLE #vectors (id int PRIMARY KEY, v vector(3) NULL, w vector(2) NULL, name nvarchar(20) NULL);
          `);
        });

        it('round-trips parameters', async function() {
          const vector = [0.1, -2.5, 3e10];
          const result = await execSql(connection, 'SELECT @v, @f', (request) => {
            request.addParameter('v', TYPES.Vector, vector);
            request.addParameter('f', TYPES.Vector, new Float32Array([1, 2]));
          });
          assert.deepEqual(values(result), [[vector.map(Math.fround), [1, 2]]]);
          assert.deepInclude(result.rows[0][0], { type: 'Vector', precision: 3 });
        });

        it('round-trips boundary values', async function() {
          const vector = [3.4028234663852886e38, -3.4028234663852886e38, 1.401298464324817e-45, 1.1754943508222875e-38, 0, 16777217];
          const result = await execSql(connection, 'SELECT @v', (request) => request.addParameter('v', TYPES.Vector, vector));
          assert.deepEqual(values(result), [[vector.map(Math.fround)]]);
        });

        it('round-trips the maximum number of dimensions', async function() {
          const vector = Array.from({ length: 1998 }, (_, i) => i / 7);
          const result = await execSql(connection, 'SELECT @v', (request) => request.addParameter('v', TYPES.Vector, vector));
          assert.deepEqual(values(result), [[vector.map(Math.fround)]]);
        });

        it('sends values that the server converts to the same JSON text', async function() {
          const vector = [0.1, -123.456, 1e-30];
          const result = await execSql(connection, 'SELECT CAST(@v AS nvarchar(max))', (request) => request.addParameter('v', TYPES.Vector, vector));
          assert.deepEqual(parseVectorText(result.rows[0][0].value).map(Math.fround), vector.map(Math.fround));
        });

        it('inserts and updates vector columns', async function() {
          await execSql(connection, 'INSERT INTO #vectors (id, v, w, name) VALUES (@id, @v, @w, @name)', (request) => {
            request.addParameter('id', TYPES.Int, 1);
            request.addParameter('v', TYPES.Vector, [1, 2, 3]);
            request.addParameter('w', TYPES.Vector, [4, 5]);
            request.addParameter('name', TYPES.NVarChar, 'first');
          });
          await execSql(connection, 'INSERT INTO #vectors (id, v, w) VALUES (@id, @v, @w)', (request) => {
            request.addParameter('id', TYPES.Int, 2);
            request.addParameter('v', TYPES.Vector, null, { length: 3 });
            request.addParameter('w', TYPES.Vector, new Float32Array([6, 7]));
          });

          await execSql(connection, 'UPDATE #vectors SET v = @v WHERE id = @id', (request) => {
            request.addParameter('id', TYPES.Int, 2);
            request.addParameter('v', TYPES.Vector, [-1, -2, -3]);
          });
          await execSql(connection, 'UPDATE #vectors SET w = @w WHERE id = @id', (request) => {
            request.addParameter('id', TYPES.Int, 1);
            request.addParameter('w', TYPES.Vector, null, { length: 2 });
          });

          assert.deepEqual(values(await execSqlBatch(connection, 'SELECT id, v, w, name FROM #vectors ORDER BY id')), [
            [1, [1, 2, 3], null, 'first'],
            [2, [-1, -2, -3], [6, 7], null]
          ]);
        });

        it('compares sent vectors on the server', async function() {
          const result = await execSql(connection, "SELECT VECTOR_DISTANCE('euclidean', @a, @b), VECTOR_NORM(@a, 'norm2')", (request) => {
            request.addParameter('a', TYPES.Vector, [3, 4, 0]);
            request.addParameter('b', TYPES.Vector, [0, 0, 0]);
          });
          assert.deepEqual(values(result), [[5, 5]]);
        });

        it('executes a request repeatedly in a transaction', async function() {
          await new Promise<void>((resolve, reject) => connection.beginTransaction((err) => (err ? reject(err) : resolve())));

          for (let id = 1; id <= 50; id++) {
            await execSql(connection, 'INSERT INTO #vectors (id, v) VALUES (@id, @v)', (request) => {
              request.addParameter('id', TYPES.Int, id);
              request.addParameter('v', TYPES.Vector, [id, id * 2, id * 3]);
            });
          }

          await new Promise<void>((resolve, reject) => connection.commitTransaction((err) => (err ? reject(err) : resolve())));

          const result = await execSqlBatch(connection, 'SELECT COUNT(*), SUM(CAST(JSON_VALUE(CAST(v AS nvarchar(max)), \'$[2]\') AS float)) FROM #vectors');
          assert.deepEqual(values(result), [[50, 3 * (50 * 51) / 2]]);
        });

        it('prepares and executes statements with vector parameters', async function() {
          let onDone: (err: Error | null | undefined) => void = () => {};
          const request = new Request('INSERT INTO #vectors (id, v) VALUES (@id, @v)', (err) => onDone(err));
          request.addParameter('id', TYPES.Int);
          request.addParameter('v', TYPES.Vector, undefined, { length: 3 });

          await new Promise<void>((resolve, reject) => {
            request.once('prepared', resolve);
            request.once('error', reject);
            connection.prepare(request);
          });

          for (const [id, v] of [[1, [1, 1, 1]], [2, null], [3, [3, 3, 3]]] as const) {
            await new Promise<void>((resolve, reject) => {
              onDone = (err) => (err ? reject(err) : resolve());
              connection.execute(request, { id, v });
            });
          }

          await new Promise<void>((resolve, reject) => {
            onDone = (err) => (err ? reject(err) : resolve());
            connection.unprepare(request);
          });

          assert.deepEqual(values(await execSqlBatch(connection, 'SELECT id, v FROM #vectors ORDER BY id')), [
            [1, [1, 1, 1]], [2, null], [3, [3, 3, 3]]
          ]);
        });

        it('fails server-side for dimensions that do not match the column', async function() {
          const error = await rejection(execSql(connection, 'INSERT INTO #vectors (id, v) VALUES (1, @v)', (request) => request.addParameter('v', TYPES.Vector, [1, 2])));
          assert.instanceOf(error, RequestError);
          assert.include(error.message, 'The vector dimensions 2 and 3 do not match.');
        });

        it('fails server-side for a null value declared with the wrong dimensions', async function() {
          const error = await rejection(execSql(connection, 'INSERT INTO #vectors (id, v) VALUES (1, @v)', (request) => request.addParameter('v', TYPES.Vector, null, { length: 1 })));
          assert.include(error.message, 'The vector dimensions 1 and 3 do not match.');
        });

        it('rejects invalid values client-side', async function() {
          for (const [value, message] of [
            [[1, Number.NaN, 3], 'the element at index 1 is not a finite number'],
            [[1, 1e39, 3], 'the element at index 1 is out of range for float32'],
            [[], 'at least one dimension'],
            ['[1, 2, 3]', 'must be an array of numbers or a Float32Array'],
            [new Array(1999).fill(1), 'at most 1998 dimensions']
          ] as const) {
            const error = await rejection(execSql(connection, 'SELECT @v', (request) => request.addParameter('v', TYPES.Vector, value)));
            assert.strictEqual(error.code, 'EPARAM');
            assert.include(error.message, message);
          }

          const error = await rejection(execSql(connection, 'SELECT @v', (request) => request.addParameter('v', TYPES.Vector, null)));
          assert.strictEqual(error.code, 'EPARAM');

          // The connection is still usable.
          assert.deepEqual(values(await execSql(connection, 'SELECT @v', (request) => request.addParameter('v', TYPES.Vector, [1]))), [[[1]]]);
        });
      });

      describe('stored procedures', function() {
        beforeEach(async function() {
          await execSqlBatch(connection, 'DROP PROCEDURE IF EXISTS [__tediousVectorProc]');
          await execSqlBatch(connection, `
            CREATE PROCEDURE [__tediousVectorProc] @in vector(3), @scale float, @out vector(3) OUTPUT, @nullOut vector(2) OUTPUT
            AS
            BEGIN
              SET @out = CAST(JSON_ARRAY(
                CAST(JSON_VALUE(CAST(@in AS nvarchar(max)), '$[0]') AS float) * @scale,
                CAST(JSON_VALUE(CAST(@in AS nvarchar(max)), '$[1]') AS float) * @scale,
                CAST(JSON_VALUE(CAST(@in AS nvarchar(max)), '$[2]') AS float) * @scale) AS vector(3));
              SET @nullOut = NULL;
              SELECT @in AS input, VECTOR_NORM(@in, 'norm1') AS norm, CAST('[9, 8]' AS vector(2)) AS other;
              RETURN 0;
            END
          `);
        });

        afterEach(async function() {
          await execSqlBatch(connection, 'DROP PROCEDURE IF EXISTS [__tediousVectorProc]');
        });

        it('passes vector parameters and returns vector output parameters and result sets', async function() {
          const result = await run(connection, 'callProcedure', '__tediousVectorProc', (request) => {
            request.addParameter('in', TYPES.Vector, [1, -2, 3]);
            request.addParameter('scale', TYPES.Float, 2);
            request.addOutputParameter('out', TYPES.Vector, null, { length: 3 });
            request.addOutputParameter('nullOut', TYPES.Vector, undefined, { length: 2 });
          });

          assert.deepEqual(values(result), [[[1, -2, 3], 6, [9, 8]]]);
          assert.deepEqual(result.outputs, { out: [2, -4, 6], nullOut: null });
        });

        it('returns vector output parameters through sp_executesql', async function() {
          const result = await execSql(connection, 'SET @out = @in', (request) => {
            request.addParameter('in', TYPES.Vector, [1.5, 2.5]);
            request.addOutputParameter('out', TYPES.Vector, null, { length: 2 });
          });
          assert.deepEqual(result.outputs, { out: [1.5, 2.5] });
        });
      });

      describe('table-valued parameters', function() {
        beforeEach(async function() {
          await execSqlBatch(connection, 'DROP PROCEDURE IF EXISTS [__tediousVectorTvpProc]; DROP TYPE IF EXISTS [__tediousVectorTvpType];');
          await execSqlBatch(connection, 'CREATE TYPE [__tediousVectorTvpType] AS TABLE (id int, v vector(3), w vector(2) NULL)');
          await execSqlBatch(connection, `
            CREATE PROCEDURE [__tediousVectorTvpProc] @t [__tediousVectorTvpType] READONLY
            AS SELECT id, v, w FROM @t ORDER BY id
          `);
        });

        afterEach(async function() {
          await execSqlBatch(connection, 'DROP PROCEDURE IF EXISTS [__tediousVectorTvpProc]; DROP TYPE IF EXISTS [__tediousVectorTvpType];');
        });

        it('sends vector columns', async function() {
          const result = await run(connection, 'callProcedure', '__tediousVectorTvpProc', (request) => {
            request.addParameter('t', TYPES.TVP, {
              name: '__tediousVectorTvpType',
              columns: [
                { name: 'id', type: TYPES.Int },
                { name: 'v', type: TYPES.Vector, length: 3 },
                { name: 'w', type: TYPES.Vector, length: 2 }
              ],
              rows: [[1, [1, 2, 3], [4, 5]], [2, new Float32Array([6, 7, 8]), null], [3, null, [9, 10]]]
            });
          });

          assert.deepEqual(values(result), [[1, [1, 2, 3], [4, 5]], [2, [6, 7, 8], null], [3, null, [9, 10]]]);
        });
      });

      describe('bulk load', function() {
        function bulkLoad(table: string, columns: Array<[string, typeof TYPES.Vector | typeof TYPES.Int | typeof TYPES.NVarChar, { length?: number, nullable: boolean }]>, rows: Iterable<unknown> | AsyncIterable<unknown>): Promise<number | undefined> {
          return new Promise((resolve, reject) => {
            const load = connection.newBulkLoad(table, (err, rowCount) => (err ? reject(err) : resolve(rowCount)));
            for (const [name, type, options] of columns) {
              load.addColumn(name, type, options);
            }
            connection.execBulkLoad(load, rows as Iterable<{ [name: string]: unknown }>);
          });
        }

        beforeEach(async function() {
          await execSqlBatch(connection, `
            DROP TABLE IF EXISTS #bulk;
            CREATE TABLE #bulk (id int NOT NULL, a vector(3) NULL, name nvarchar(50) NULL, b vector(128) NULL);
          `);
        });

        it('loads rows with multiple vector columns, mixed types and nulls', async function() {
          const b = Array.from({ length: 128 }, (_, i) => i / 3);
          const rowCount = await bulkLoad('#bulk', [
            ['id', TYPES.Int, { nullable: false }],
            ['a', TYPES.Vector, { length: 3, nullable: true }],
            ['name', TYPES.NVarChar, { length: 50, nullable: true }],
            ['b', TYPES.Vector, { length: 128, nullable: true }]
          ], [
            { id: 1, a: [1, 2, 3], name: 'one', b },
            { id: 2, a: null, name: null, b: new Float32Array(b) },
            { id: 3, a: new Float32Array([-1, 0.5, 1e-10]), name: 'three', b: null },
            [4, null, 'four', null]
          ]);

          assert.strictEqual(rowCount, 4);
          assert.deepEqual(values(await execSqlBatch(connection, 'SELECT id, a, name, b FROM #bulk ORDER BY id')), [
            [1, [1, 2, 3], 'one', b.map(Math.fround)],
            [2, null, null, b.map(Math.fround)],
            [3, [-1, 0.5, Math.fround(1e-10)], 'three', null],
            [4, null, 'four', null]
          ]);
        });

        it('loads a large number of rows from an async source', async function() {
          const count = 20000;
          async function * rows() {
            for (let id = 1; id <= count; id++) {
              yield { id, a: [id, -id, id / 4], b: id % 10 === 0 ? null : Array.from({ length: 128 }, (_, i) => id + i) };
            }
          }

          const rowCount = await bulkLoad('#bulk', [
            ['id', TYPES.Int, { nullable: false }],
            ['a', TYPES.Vector, { length: 3, nullable: true }],
            ['b', TYPES.Vector, { length: 128, nullable: true }]
          ], rows());
          assert.strictEqual(rowCount, count);

          const result = await execSqlBatch(connection, `
            SELECT COUNT(*), COUNT(b), SUM(VECTOR_NORM(a, 'norm1')),
                   SUM(CASE WHEN VECTOR_DISTANCE('euclidean', a, CAST(JSON_ARRAY(id, -id, id / 4.0) AS vector(3))) = 0 THEN 1 ELSE 0 END)
            FROM #bulk
          `);
          const sumOfNorms = Array.from({ length: count }, (_, i) => (i + 1) * 2.25).reduce((sum, norm) => sum + norm, 0);
          assert.deepEqual(values(result), [[count, count - count / 10, sumOfNorms, count]]);

          const sample = await execSqlBatch(connection, 'SELECT b FROM #bulk WHERE id = 12345');
          assert.deepEqual(values(sample), [[Array.from({ length: 128 }, (_, i) => 12345 + i)]]);
        });

        it('fails the bulk load for values with the wrong dimensions, and loads no rows', async function() {
          async function * rows() {
            for (let id = 1; id <= 1000; id++) {
              yield { id, a: id === 500 ? [1, 2] : [1, 2, 3] };
            }
          }

          const error = await rejection(bulkLoad('#bulk', [
            ['id', TYPES.Int, { nullable: false }],
            ['a', TYPES.Vector, { length: 3, nullable: true }]
          ], rows()));

          assert.include(error.message, 'Column \'a\' could not be serialized');
          assert.include((error.cause as Error).message, 'the value has 2 dimension(s), but 3 were declared');

          assert.deepEqual(values(await execSqlBatch(connection, 'SELECT COUNT(*) FROM #bulk')), [[0]]);
        });

        it('fails the bulk load for invalid values', async function() {
          const error = await rejection(bulkLoad('#bulk', [
            ['id', TYPES.Int, { nullable: false }],
            ['a', TYPES.Vector, { length: 3, nullable: true }]
          ], [{ id: 1, a: [1, Number.POSITIVE_INFINITY, 3] }]));

          assert.include(error.message, 'the element at index 1 is not a finite number');
          assert.deepEqual(values(await execSqlBatch(connection, 'SELECT COUNT(*) FROM #bulk')), [[0]]);
        });

        it('fails server-side for a column declared with the wrong dimensions', async function() {
          const error = await rejection(bulkLoad('#bulk', [
            ['id', TYPES.Int, { nullable: false }],
            ['a', TYPES.Vector, { length: 4, nullable: true }]
          ], [{ id: 1, a: [1, 2, 3, 4] }]));

          assert.instanceOf(error, RequestError);
          assert.deepEqual(values(await execSqlBatch(connection, 'SELECT COUNT(*) FROM #bulk')), [[0]]);
        });
      });

      describe('float16', function() {
        beforeEach(function() {
          if (!serverSupportsFloat16) {
            this.skip();
          }
        });

        it('rounds like the server', async function() {
          const numbers = [0.1, 1 / 3, -123.456, 65504, 6e-8, 1e-5, 2049, 0.000061, 3.14159];
          const result = await execSqlBatch(connection, `
            DECLARE @v vector(${numbers.length}, float16) = '[${numbers.join(',')}]';
            SELECT CAST(@v AS nvarchar(max));
          `);
          const serverValues = parseVectorText(result.rows[0][0].value);
          assert.deepEqual(float16(serverValues), float16(numbers));
          // The text has 8 significant digits: enough to tell float16 values apart.
          serverValues.forEach((value, i) => assert.closeTo(value, float16(numbers)[i], Math.abs(float16(numbers)[i]) * 1e-7));
        });

        describe('with version 2 negotiated', function() {
          beforeEach(function() {
            if (connection.vectorSupportVersion < 2) {
              this.skip();
            }
          });

          it('round-trips parameters and reads columns', async function() {
            const result = await execSql(connection, "SELECT @h, CAST('[1, 2.5, -3]' AS vector(3, float16)), CAST(@h AS nvarchar(max))", (request) => {
              request.addParameter('h', TYPES.VectorFloat16, [0.1, 2, 30]);
            });
            const [[h, literal, text]] = result.rows;
            assert.deepInclude(h, { type: 'VectorFloat16', precision: 3, dataLength: 14, value: float16([0.1, 2, 30]) });
            assert.deepInclude(literal, { type: 'VectorFloat16', value: [1, 2.5, -3] });
            assert.deepEqual(float16(parseVectorText(text.value)), float16([0.1, 2, 30]));
          });

          it('bulk loads float16 columns', async function() {
            await execSqlBatch(connection, 'DROP TABLE IF EXISTS #bulk16; CREATE TABLE #bulk16 (id int NOT NULL, h vector(2, float16) NULL)');
            const rowCount = await new Promise((resolve, reject) => {
              const load = connection.newBulkLoad('#bulk16', (err, count) => (err ? reject(err) : resolve(count)));
              load.addColumn('id', TYPES.Int, { nullable: false });
              load.addColumn('h', TYPES.VectorFloat16, { length: 2, nullable: true });
              connection.execBulkLoad(load, [{ id: 1, h: [0.1, -2] }, { id: 2, h: null }]);
            });
            assert.strictEqual(rowCount, 2);
            assert.deepEqual(values(await execSqlBatch(connection, 'SELECT id, h FROM #bulk16 ORDER BY id')), [[1, float16([0.1, -2])], [2, null]]);
          });
        });

        describe('with only version 1 negotiated', function() {
          beforeEach(function() {
            if (connection.vectorSupportVersion !== 1) {
              this.skip();
            }
          });

          it('returns float16 columns as JSON text', async function() {
            const result = await execSqlBatch(connection, "SELECT CAST('[1, 2.5]' AS vector(2, float16))");
            assert.strictEqual(result.rows[0][0].type, 'VarChar');
            assert.deepEqual(parseVectorText(result.rows[0][0].value), [1, 2.5]);
          });

          it('rejects float16 parameters without sending them', async function() {
            const error = await rejection(execSql(connection, 'SELECT @h', (request) => request.addParameter('h', TYPES.VectorFloat16, [1])));
            assert.strictEqual(error.code, 'EVECTORNOTSUPPORTED');
          });
        });
      });
    });

    describe('with `vectorTypeSupport: \'off\'`', function() {
      let offConnection: Connection;

      beforeEach(async function() {
        offConnection = await connect({ vectorTypeSupport: 'off' });
      });

      afterEach(async function() {
        await close(offConnection);
      });

      it('returns vector columns as JSON text, as before vector support', async function() {
        assert.strictEqual(offConnection.vectorSupportVersion, 0);
        const result = await execSqlBatch(offConnection, "SELECT CAST('[1, 2.5, -3]' AS vector(3))");
        // The server's string type depends on the TDS version: `varchar(max)`,
        // `nvarchar(max)` below TDS 7.4 (no UTF-8 support), or `ntext` on TDS
        // 7.1 (no `max` types).
        assert.oneOf(result.rows[0][0].type, ['VarChar', 'NVarChar', 'NText']);
        assert.isString(result.rows[0][0].value);
        assert.deepEqual(parseVectorText(result.rows[0][0].value), [1, 2.5, -3]);
      });

      it('rejects vector parameters', async function() {
        const error = await rejection(execSql(offConnection, 'SELECT @v', (request) => request.addParameter('v', TYPES.Vector, [1])));
        assert.strictEqual(error.code, 'EVECTORNOTSUPPORTED');
      });
    });
  });
});
