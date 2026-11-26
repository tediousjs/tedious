import { TYPES } from '../../src/tedious';

import { rejects } from 'node:assert/strict';
import { assert } from 'chai';

import Connection from '../../src/connection';
import Request from '../../src/request';
import { debugOptionsFromEnv } from '../helpers/debug-options-from-env';
import { requireVectorSupport } from '../helpers/vector-support';

import defaultConfig from '../config';
import { InputError } from '../../src/errors';

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

describe('calling a procedure that takes and returns a TVP', function() {
  let config: ReturnType<typeof getConfig>;

  let connection: Connection;

  beforeEach(function(done) {
    config = getConfig();

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
      DROP PROCEDURE IF EXISTS [__tediousTvpTest]
    `, done));
  });

  beforeEach(function(done) {
    connection.execSqlBatch(new Request(`
      DROP TYPE IF EXISTS [__tediousTvpType];
      CREATE TYPE [__tediousTvpType] AS TABLE (
        a bit,
        b tinyint,
        c smallint,
        d int,
        e bigint,
        f real,
        g float,
        h varchar (100),
        i nvarchar (100),
        j datetime
      )
    `, done));
  });

  beforeEach(function(done) {
    connection.execSqlBatch(new Request(`
      CREATE PROCEDURE [__tediousTvpTest] @tvp __tediousTvpType readonly AS BEGIN
        select * from @tvp
      END
    `, done));
  });

  afterEach(function(done) {
    const sql = 'DROP PROCEDURE IF EXISTS [__tediousTvpTest]';
    connection.execSqlBatch(new Request(sql, done));
  });

  afterEach(function(done) {
    const sql = 'DROP TYPE IF EXISTS [__tediousTvpType]';
    connection.execSqlBatch(new Request(sql, done));
  });

  afterEach(function() {
    connection.close();
  });

  describe('Binary columns', function() {
    beforeEach(function(done) {
      connection.execSqlBatch(new Request(`
        DROP PROCEDURE [__tediousTvpTest];
        DROP TYPE [__tediousTvpType];
        CREATE TYPE [__tediousTvpType] AS TABLE (
          id int,
          c binary(3)
        )
      `, done));
    });

    beforeEach(function(done) {
      connection.execSqlBatch(new Request(`
        CREATE PROCEDURE [__tediousTvpTest] @tvp __tediousTvpType readonly AS BEGIN
          SELECT c FROM @tvp ORDER BY id
        END
      `, done));
    });

    it('pads shorter values and preserves exact-length and null values', function(done) {
      const rows: unknown[] = [];
      const request = new Request('__tediousTvpTest', (err) => {
        assert.ifError(err);
        assert.deepEqual(rows, [Buffer.from('410000', 'hex'), Buffer.from('ABC'), Buffer.alloc(3), null]);
        done();
      });
      request.on('row', (columns) => rows.push(columns[0].value));
      request.addParameter('tvp', TYPES.TVP, {
        columns: [
          { name: 'id', type: TYPES.Int },
          { name: 'c', type: TYPES.Binary, length: 3 }
        ],
        rows: [[0, Buffer.from('A')], [1, Buffer.from('ABC')], [2, Buffer.alloc(0)], [3, null]]
      });
      connection.callProcedure(request);
    });

    it('rejects a value longer than the declared length instead of silently truncating it', function(done) {
      const request = new Request('__tediousTvpTest', (err) => {
        assert.instanceOf(err, InputError);
        assert.strictEqual(err?.message, 'Input parameter \'tvp\' could not be validated');
        assert.instanceOf(err?.cause, TypeError);
        assert.strictEqual((err?.cause as TypeError).message, 'Binary value of 5 bytes exceeds the declared length of 3.');

        connection.execSql(new Request('SELECT 1', done));
      });
      request.addParameter('tvp', TYPES.TVP, {
        columns: [
          { name: 'id', type: TYPES.Int },
          { name: 'c', type: TYPES.Binary, length: 3 }
        ],
        rows: [[0, Buffer.from('ABCDE')]]
      });
      connection.callProcedure(request);
    });
  });

  it('returns the same data', function(done) {
    const request = new Request('__tediousTvpTest', done);

    request.on('doneInProc', function(rowCount, more) {
      assert.strictEqual(rowCount, 1);
    });

    request.on('row', function(columns) {
      assert.strictEqual(columns[0].value, false);
      assert.strictEqual(columns[1].value, 1);
      assert.strictEqual(columns[2].value, 2);
      assert.strictEqual(columns[3].value, 3);
      assert.strictEqual(columns[4].value, '4');
      assert.strictEqual(columns[5].value, 5.5);
      assert.strictEqual(columns[6].value, 6.6);
      assert.strictEqual(columns[7].value, 'asdf');
      assert.strictEqual(columns[8].value, 'asdf');
      assert.strictEqual(+columns[9].value, +new Date(Date.UTC(2014, 0, 1)));
    });

    const table = {
      columns: [
        {
          name: 'a',
          type: TYPES.Bit
        },
        {
          name: 'b',
          type: TYPES.TinyInt
        },
        {
          name: 'c',
          type: TYPES.SmallInt
        },
        {
          name: 'd',
          type: TYPES.Int
        },
        {
          name: 'e',
          type: TYPES.BigInt
        },
        {
          name: 'f',
          type: TYPES.Real
        },
        {
          name: 'g',
          type: TYPES.Float
        },
        {
          name: 'h',
          type: TYPES.VarChar,
          length: 100
        },
        {
          name: 'i',
          type: TYPES.NVarChar,
          length: 100
        },
        {
          name: 'j',
          type: TYPES.DateTime,
          length: 100
        }
      ],
      rows: [
        [
          false,
          1,
          2,
          3,
          4,
          5.5,
          6.6,
          'asdf',
          'asdf',
          new Date(Date.UTC(2014, 0, 1))
        ]
      ]
    };

    request.addParameter('tvp', TYPES.TVP, table, {});

    connection.callProcedure(request);
  });

  it('returns the same data when string column lengths are left out', function(done) {
    const request = new Request('__tediousTvpTest', done);

    request.on('doneInProc', function(rowCount, more) {
      assert.strictEqual(rowCount, 1);
    });

    request.on('row', function(columns) {
      assert.strictEqual(columns[7].value, 'asdf');
      assert.strictEqual(columns[8].value, 'asdf');
    });

    const table = {
      columns: [
        {
          name: 'a',
          type: TYPES.Bit
        },
        {
          name: 'b',
          type: TYPES.TinyInt
        },
        {
          name: 'c',
          type: TYPES.SmallInt
        },
        {
          name: 'd',
          type: TYPES.Int
        },
        {
          name: 'e',
          type: TYPES.BigInt
        },
        {
          name: 'f',
          type: TYPES.Real
        },
        {
          name: 'g',
          type: TYPES.Float
        },
        {
          name: 'h',
          type: TYPES.VarChar
        },
        {
          name: 'i',
          type: TYPES.NVarChar
        },
        {
          name: 'j',
          type: TYPES.DateTime
        }
      ],
      rows: [
        [
          false,
          1,
          2,
          3,
          4,
          5.5,
          6.6,
          'asdf',
          'asdf',
          new Date(Date.UTC(2014, 0, 1))
        ]
      ]
    };

    request.addParameter('tvp', TYPES.TVP, table, {});

    connection.callProcedure(request);
  });

  it('correctly handles validation errors', function(done) {
    const request = new Request('__tediousTvpTest', (err) => {
      assert.instanceOf(err, InputError);
      assert.strictEqual(err?.message, 'Input parameter \'tvp\' could not be validated');

      assert.instanceOf(err?.cause, InputError);
      assert.strictEqual((err?.cause as InputError).message, 'TVP column \'b\' has invalid data at row index 0');

      assert.instanceOf((err?.cause as InputError).cause, TypeError);
      assert.strictEqual(((err?.cause as InputError).cause as TypeError).message, 'Value must be between 0 and 255, inclusive.');

      const request = new Request('SELECT 1', done);
      connection.execSql(request);
    });

    const table = {
      columns: [
        {
          name: 'a',
          type: TYPES.Bit
        },
        {
          name: 'b',
          type: TYPES.TinyInt
        },
        {
          name: 'c',
          type: TYPES.SmallInt
        },
        {
          name: 'd',
          type: TYPES.Int
        },
        {
          name: 'e',
          type: TYPES.BigInt
        },
        {
          name: 'f',
          type: TYPES.Real
        },
        {
          name: 'g',
          type: TYPES.Float
        },
        {
          name: 'h',
          type: TYPES.VarChar,
          length: 100
        },
        {
          name: 'i',
          type: TYPES.NVarChar,
          length: 100
        },
        {
          name: 'j',
          type: TYPES.DateTime,
          length: 100
        }
      ],
      rows: [
        [
          false,
          // This value is outside of `tinyint` range
          1123,
          2,
          3,
          4,
          5.5,
          6.6,
          'asdf',
          'asdf',
          new Date(Date.UTC(2014, 0, 1))
        ]
      ]
    };

    request.addParameter('tvp', TYPES.TVP, table, {});

    connection.callProcedure(request);
  });

  describe('Vector columns', function() {
    // Replaces the table type and procedure with ones that take vectors.
    function createTypeAndProcedure(columns: string) {
      return new Promise<void>((resolve, reject) => {
        connection.execSqlBatch(new Request(`
          DROP PROCEDURE [__tediousTvpTest];
          DROP TYPE [__tediousTvpType];
          CREATE TYPE [__tediousTvpType] AS TABLE (id int, ${columns});
          EXEC('CREATE PROCEDURE [__tediousTvpTest] @tvp __tediousTvpType readonly AS SELECT * FROM @tvp ORDER BY id');
        `, (err) => (err ? reject(err) : resolve())));
      });
    }

    function callProcedure(tvp: object, targetConnection = connection) {
      return new Promise<unknown[][]>((resolve, reject) => {
        const rows: unknown[][] = [];
        const request = new Request('__tediousTvpTest', (err) => (err ? reject(err) : resolve(rows)));
        request.on('row', (columns) => rows.push(columns.map((column: { value: unknown }) => column.value)));
        request.addParameter('tvp', TYPES.TVP, tvp);
        targetConnection.callProcedure(request);
      });
    }

    function connect(vectorTypeSupport: 'v1' | 'v2') {
      return new Promise<Connection>((resolve, reject) => {
        const vectorConnection = new Connection({ ...config, options: { ...config.options, vectorTypeSupport } });
        vectorConnection.connect((err) => (err ? reject(err) : resolve(vectorConnection)));
      });
    }

    function close(targetConnection: Connection) {
      return new Promise<void>((resolve) => {
        targetConnection.on('end', () => resolve());
        targetConnection.close();
      });
    }

    it('rejects vector columns without negotiated vector support', async function() {
      // `connection` uses the default `vectorTypeSupport: 'off'`.
      await rejects(callProcedure({
        columns: [{ name: 'v', type: TYPES.Vector, length: 3 }],
        rows: [[null]]
      }), { code: 'EVECTORNOTSUPPORTED' });
    });

    describe('with vector support negotiated', function() {
      beforeEach(async function() {
        await close(connection);
        connection = await connect('v2');
        await requireVectorSupport(this, connection);
      });

      it('reports the column and row of an invalid vector value', async function() {
        await createTypeAndProcedure('v vector(3) NULL');

        await rejects(callProcedure({
          columns: [
            { name: 'id', type: TYPES.Int },
            { name: 'v', type: TYPES.Vector, length: 3 }
          ],
          rows: [[1, new Float32Array([1, 2, 3])], [2, new Float32Array([1, 2])]]
        }), (error: Error) => {
          assert.include((error.cause as Error).message, 'TVP column \'v\' has invalid data at row index 1');
          return true;
        });
      });

      it('sends vector values', async function() {
        await createTypeAndProcedure('v vector(3) NULL');

        const rows = await callProcedure({
          columns: [
            { name: 'id', type: TYPES.Int },
            // A vector column needs its number of dimensions.
            { name: 'v', type: TYPES.Vector, length: 3 }
          ],
          rows: [[1, new Float32Array([1, 2.5, -3])], [2, new Float32Array([4, 5, 6])], [3, null]]
        });

        assert.instanceOf(rows[0][1], Float32Array);
        assert.deepEqual(rows.map(([id, value]) => [id, value === null ? null : Array.from(value as Float32Array)]), [[1, [1, 2.5, -3]], [2, [4, 5, 6]], [3, null]]);
      });

      it('sends float16 vector values', async function() {
        const Float16Array = (globalThis as { Float16Array?: new (values: number[]) => ArrayLike<number> }).Float16Array;
        // `float16` vectors require vector support version 2 and `Float16Array`.
        if (connection.vectorSupportVersion < 2 || !Float16Array) {
          this.skip();
        }

        await createTypeAndProcedure('h vector(3, float16) NULL');

        const rows = await callProcedure({
          columns: [
            { name: 'id', type: TYPES.Int },
            { name: 'h', type: TYPES.Vector, length: 3, baseType: 'float16' }
          ],
          rows: [[1, new Float16Array([1, 2.5, -3])], [2, null]]
        });

        assert.instanceOf(rows[0][1], Float16Array);
        assert.deepEqual(rows.map(([id, value]) => [id, value === null ? null : Array.from(value as ArrayLike<number>)]), [[1, [1, 2.5, -3]], [2, null]]);
      });

      it('rejects float16 vector columns in a TVP when only version 1 is negotiated', async function() {
        const v1 = await connect('v1');
        try {
          await requireVectorSupport(this, v1);

          await rejects(callProcedure({
            columns: [
              { name: 'id', type: TYPES.Int },
              { name: 'h', type: TYPES.Vector, length: 3, baseType: 'float16' }
            ],
            rows: [[1, null]]
          }, v1), { code: 'EVECTORNOTSUPPORTED' });
        } finally {
          await close(v1);
        }
      });
    });
  });
});
