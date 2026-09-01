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
    enableVectorSupport: true,
    debug: debugOptionsFromEnv(),
    tdsVersion: process.env.TEDIOUS_TDS_VERSION
  }
};

describe('Vector data type without negotiated support', function() {
  let connection: Connection;

  beforeEach(function(done) {
    connection = new Connection({
      ...config,
      options: { ...config.options, enableVectorSupport: false }
    });

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

  it('fails vector parameters with a clear error', function(done) {
    assert.isFalse(connection.serverSupportsVectorType);

    const request = new Request('SELECT @v', function(err) {
      assert.instanceOf(err, Error);
      assert.match((err as Error).message, /require vector support to be negotiated/);

      done();
    });

    request.addParameter('v', TYPES.Vector, new Float32Array([1, 2, 3]));

    connection.execSql(request);
  });
});

describe('Vector data type', function() {
  let connection: Connection;

  beforeEach(function(done) {
    connection = new Connection(config);

    connection.on('errorMessage', function(error) {
      console.log(`${error.number} : ${error.message}`);
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }

    connection.connect((err) => {
      if (err) {
        return done(err);
      }

      // Servers older than SQL Server 2025 do not acknowledge the
      // VECTORSUPPORT feature and do not support the `vector` data type.
      if (!connection.serverSupportsVectorType) {
        this.skip();
      }

      done();
    });
  });

  afterEach(function(done) {
    if (!connection.closed) {
      connection.on('end', done);
      connection.close();
    } else {
      done();
    }
  });

  it('reads vector values as Float32Array', function(done) {
    const request = new Request('SELECT CAST(\'[1.5, -2.5, 3]\' AS vector(3))', function(err) {
      if (err) {
        return done(err);
      }

      assert.strictEqual(values.length, 1);
      assert.instanceOf(values[0], Float32Array);
      assert.deepEqual(values[0], new Float32Array([1.5, -2.5, 3]));

      done();
    });

    const values: unknown[] = [];
    request.on('row', (columns) => {
      values.push(columns[0].value);
    });

    connection.execSql(request);
  });

  it('reads NULL vector values', function(done) {
    const request = new Request('SELECT CAST(NULL AS vector(3))', function(err) {
      if (err) {
        return done(err);
      }

      assert.deepEqual(values, [null]);

      done();
    });

    const values: unknown[] = [];
    request.on('row', (columns) => {
      values.push(columns[0].value);
    });

    connection.execSql(request);
  });

  it('round-trips vector parameters', function(done) {
    const expected = new Float32Array(1998);
    for (let i = 0; i < expected.length; i++) {
      expected[i] = (i - 999) / 4;
    }

    const request = new Request('SELECT @v', function(err) {
      if (err) {
        return done(err);
      }

      assert.strictEqual(values.length, 1);
      assert.instanceOf(values[0], Float32Array);
      assert.deepEqual(values[0], expected);

      done();
    });

    request.addParameter('v', TYPES.Vector, expected);

    const values: unknown[] = [];
    request.on('row', (columns) => {
      values.push(columns[0].value);
    });

    connection.execSql(request);
  });

  it('round-trips NULL vector parameters', function(done) {
    const request = new Request('SELECT @v', function(err) {
      if (err) {
        return done(err);
      }

      assert.deepEqual(values, [null]);

      done();
    });

    request.addParameter('v', TYPES.Vector, null, { length: 3 });

    const values: unknown[] = [];
    request.on('row', (columns) => {
      values.push(columns[0].value);
    });

    connection.execSql(request);
  });

  it('inserts and reads back vector columns', function(done) {
    const first = new Float32Array([0.5, 1.5, 2.5]);
    const second = new Float32Array([-1, 0, 1]);

    const setupRequest = new Request('CREATE TABLE #vectors ([id] int PRIMARY KEY, [v] vector(3) NULL)', (err) => {
      if (err) {
        return done(err);
      }

      const insertRequest = new Request('INSERT INTO #vectors ([id], [v]) VALUES (1, @first), (2, @second), (3, @null)', (err) => {
        if (err) {
          return done(err);
        }

        const selectRequest = new Request('SELECT [v] FROM #vectors ORDER BY [id]', (err) => {
          if (err) {
            return done(err);
          }

          assert.deepEqual(values, [first, second, null]);

          done();
        });

        const values: unknown[] = [];
        selectRequest.on('row', (columns) => {
          values.push(columns[0].value);
        });

        connection.execSql(selectRequest);
      });

      insertRequest.addParameter('first', TYPES.Vector, first);
      insertRequest.addParameter('second', TYPES.Vector, second);
      insertRequest.addParameter('null', TYPES.Vector, null, { length: 3 });

      connection.execSql(insertRequest);
    });

    connection.execSqlBatch(setupRequest);
  });
});
