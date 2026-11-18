import { assert } from 'chai';
import { typeByName as TYPES } from '../../src/data-type';

import Connection from '../../src/connection';
import Request from '../../src/request';
import { debugOptionsFromEnv } from '../helpers/debug-options-from-env';

import defaultConfig from '../config';

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

type DataType = typeof TYPES[keyof typeof TYPES];

describe('RPC test', function() {
  let connection: Connection;

  beforeEach(function(done) {
    const config = getConfig();
    connection = new Connection(config);
    connection.connect(done);

    connection.on('infoMessage', (info) => {
      // console.log("#{info.number} : #{info.message}")
    });

    connection.on('errorMessage', (error) => {
      console.log(`${error.number} : ${error.message}`);
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  });

  afterEach(function(done) {
    if (!connection.closed) {
      connection.on('end', done);
      connection.close();
    } else {
      done();
    }
  });

  function execSqlBatch(connection: Connection, sql: string, done: () => void) {
    const request = new Request(sql, function(err) {
      if (err) {
        console.log(err);
        assert.fail('SQL batch execution failed');
      }

      done();
    });

    connection.execSqlBatch(request);
  }

  function testProc(done: Mocha.Done, type: DataType, typeAsString: string, value: unknown) {
    const request = new Request('#test_proc', function(err) {
      assert.ifError(err);

      done();
    });

    request.addParameter('param', type, value);

    request.on('doneProc', function(rowCount, more, returnStatus) {
      assert.isFalse(more);
      assert.strictEqual(returnStatus, 0);
    });

    request.on('doneInProc', function(rowCount, more) {
      assert.isTrue(more);
    });

    request.on('row', function(columns) {
      if (value instanceof Date) {
        assert.strictEqual(columns[0].value.getTime(), value.getTime());
      } else {
        assert.strictEqual(columns[0].value, value);
      }
    });

    execSqlBatch(
      connection,
      `\
CREATE PROCEDURE #test_proc \
@param ${typeAsString} \
AS \
select @param\
`,
      function() {
        connection.callProcedure(request);
      }
    );
  }

  function testProcOutput(done: Mocha.Done, type: DataType, typeAsString: string, value: unknown) {
    const request = new Request('#test_proc', function(err) {
      assert.ifError(err);

      done();
    });

    request.addParameter('paramIn', type, value);
    request.addOutputParameter('paramOut', type);

    request.on('doneProc', function(rowCount, more, returnStatus) {
      assert.isFalse(more);
      assert.strictEqual(returnStatus, 0);
    });

    request.on('doneInProc', function(rowCount, more) {
      assert.isTrue(more);
    });

    request.on('returnValue', function(name, returnValue, metadata) {
      assert.strictEqual(name, 'paramOut');
      if (value instanceof Date && returnValue instanceof Date) {
        assert.strictEqual(returnValue.getTime(), value.getTime());
      } else {
        assert.strictEqual(returnValue, value);
      }
      assert.isDefined(metadata);
    });

    execSqlBatch(
      connection,
      `\
CREATE PROCEDURE #test_proc \
@paramIn ${typeAsString}, \
@paramOut ${typeAsString} output \
AS \
set @paramOut = @paramIn\
`,
      function() {
        connection.callProcedure(request);
      }
    );
  }

  it('should exec proc varchar', function(done) {
    testProc(done, TYPES.VarChar, 'varchar(10)', 'test');
  });

  it('should exec proc varchar null', function(done) {
    testProc(done, TYPES.VarChar, 'varchar(10)', null);
  });

  it('should exec proc NVarChar', function(done) {
    testProc(done, TYPES.NVarChar, 'nvarchar(10)', 'test');
  });

  it('should exec procNVarChar null', function(done) {
    testProc(done, TYPES.NVarChar, 'nvarchar(10)', null);
  });

  it('should exec proc tiny int', function(done) {
    testProc(done, TYPES.TinyInt, 'tinyint', 3);
  });

  it('should exec proc tiny int null', function(done) {
    testProc(done, TYPES.TinyInt, 'tinyint', null);
  });

  it('should exec proc small int', function(done) {
    testProc(done, TYPES.SmallInt, 'smallint', 3);
  });

  it('should exec proc small int null', function(done) {
    testProc(done, TYPES.SmallInt, 'smallint', null);
  });

  it('should exec proc bigint', function(done) {
    testProc(done, TYPES.BigInt, 'bigint', '3');
  });

  it('should exec proc negative bigint', function(done) {
    testProc(done, TYPES.BigInt, 'bigint', '-3');
  });

  it('should exec proc bigint null', function(done) {
    testProc(done, TYPES.BigInt, 'bigint', null);
  });

  it('should exec proc int', function(done) {
    testProc(done, TYPES.Int, 'int', 3);
  });

  it('should exec proc int null', function(done) {
    testProc(done, TYPES.Int, 'int', null);
  });

  it('should exec proc small date time', function(done) {
    testProc(
      done,
      TYPES.SmallDateTime,
      'smalldatetime',
      new Date('December 4, 2011 10:04:00')
    );
  });

  it('should exec proc small date time null', function(done) {
    testProc(done, TYPES.SmallDateTime, 'smalldatetime', null);
  });

  it('should exec proc date time', function(done) {
    testProc(
      done,
      TYPES.DateTime,
      'datetime',
      new Date('December 4, 2011 10:04:23')
    );
  });

  it('should exec proc date time null', function(done) {
    testProc(done, TYPES.DateTime, 'datetime', null);
  });

  it('should exec proc output varchar', function(done) {
    testProcOutput(done, TYPES.VarChar, 'varchar(10)', 'test');
  });

  it('should exec proc output varchar null', function(done) {
    testProcOutput(done, TYPES.VarChar, 'varchar(10)', null);
  });

  it('should exec proc output NVarChar', function(done) {
    testProcOutput(done, TYPES.NVarChar, 'varchar(10)', 'test');
  });

  it('should exec proc out NVarChar null', function(done) {
    testProcOutput(done, TYPES.NVarChar, 'varchar(10)', null);
  });

  it('should exec proc output tiny int', function(done) {
    testProcOutput(done, TYPES.TinyInt, 'tinyint', 3);
  });

  it('should exec proc output tiney int null', function(done) {
    testProcOutput(done, TYPES.TinyInt, 'tinyint', null);
  });

  it('should exec proc output small int', function(done) {
    testProcOutput(done, TYPES.SmallInt, 'smallint', 3);
  });

  it('should exec proc output small int null', function(done) {
    testProcOutput(done, TYPES.SmallInt, 'smallint', null);
  });

  it('should exec proc output int', function(done) {
    testProcOutput(done, TYPES.Int, 'int', 3);
  });

  it('should exec proc output int null', function(done) {
    testProcOutput(done, TYPES.Int, 'int', null);
  });

  it('should exec proc output small date time', function(done) {
    testProcOutput(
      done,
      TYPES.SmallDateTime,
      'smalldatetime',
      new Date('December 4, 2011 10:04:00')
    );
  });

  it('should exec proc output small date time null', function(done) {
    testProcOutput(done, TYPES.SmallDateTime, 'smalldatetime', null);
  });

  it('should exec proc output date time', function(done) {
    testProcOutput(
      done,
      TYPES.DateTime,
      'datetime',
      new Date('December 4, 2011 10:04:23')
    );
  });

  it('should exec proc output date time null', function(done) {
    testProcOutput(done, TYPES.DateTime, 'datetime', null);
  });

  it('should exec proc with bad name', function(done) {
    const config = getConfig();

    const request = new Request('bad_proc_name', function(err) {
      assert.isDefined(err);

      connection.close();
    });

    request.on('doneProc', function(rowCount, more, returnStatus) {
      assert.isFalse(more);
    });

    request.on('doneInProc', function(rowCount, more) {
      assert.isTrue(more);
    });

    request.on('row', function(columns) {
      assert.fail('Expected no rows');
    });

    let connection = new Connection(config);

    connection.connect(function(err) {
      connection.callProcedure(request);
    });

    connection.on('end', function() {
      done();
    });

    connection.on(
      'infoMessage',
      function(info) { }
      // console.log("#{info.number} : #{info.message}")
    );

    connection.on('errorMessage', function(error) {
      // console.log("#{error.number} : #{error.message}")
      assert.isDefined(error);
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  });

  it('should proc return value', function(done) {
    const config = getConfig();

    const request = new Request('#test_proc', function(err) {
      connection.close();
    });

    request.on('doneProc', function(rowCount, more, returnStatus) {
      assert.isFalse(more);
      assert.strictEqual(returnStatus, -1); // Non-zero indicates a failure.
    });

    request.on('doneInProc', function(rowCount, more) {
      assert.isTrue(more);
    });

    let connection = new Connection(config);

    connection.connect(function(err) {
      execSqlBatch(
        connection,
        '\
  CREATE PROCEDURE #test_proc \
  AS \
  return -1\
  ',
        function() {
          connection.callProcedure(request);
        }
      );
    });

    connection.on('end', function() {
      done();
    });

    connection.on(
      'infoMessage',
      function(info) { }
      // console.log("#{info.number} : #{info.message}")
    );

    connection.on('errorMessage', function(error) {
      // console.log("#{error.number} : #{error.message}")
      assert.isDefined(error);
    });

    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
  });

  describe('vector parameters', function() {
    function run(sqlOrProcedure: string, method: 'execSqlBatch' | 'callProcedure', addParameters: (request: Request) => void = () => {}) {
      return new Promise<{ rows: unknown[][], outputs: { [name: string]: { value: unknown, metadata: any } } }>((resolve, reject) => {
        const rows: unknown[][] = [];
        const outputs: { [name: string]: { value: unknown, metadata: any } } = {};
        const request = new Request(sqlOrProcedure, (err) => (err ? reject(err) : resolve({ rows, outputs })));
        request.on('row', (columns) => rows.push(columns.map((column: { value: unknown }) => column.value)));
        request.on('returnValue', (name, value, metadata) => {
          outputs[name] = { value, metadata };
        });
        addParameters(request);
        connection[method](request);
      });
    }

    beforeEach(async function() {
      await new Promise<void>((resolve) => {
        connection.on('end', () => resolve());
        connection.close();
      });

      const config = getConfig();
      connection = await new Promise<Connection>((resolve, reject) => {
        const vectorConnection = new Connection({ ...config, options: { ...config.options, vectorTypeSupport: 'v2' } });
        vectorConnection.connect((err) => (err ? reject(err) : resolve(vectorConnection)));
      });

      // Requires a server with the `vector` data type, and TDS 7.4.
      if (connection.vectorSupportVersion < 1) {
        this.skip();
      }
    });

    it('should call a procedure with vector input and output parameters', async function() {
      await run(`
        CREATE PROCEDURE #test_vector_proc @in vector(3), @out vector(3) OUTPUT, @nullOut vector(2) OUTPUT
        AS
        BEGIN
          SET @out = @in;
          SET @nullOut = NULL;
          SELECT @in, VECTOR_NORM(@in, 'norm1');
        END
      `, 'execSqlBatch');

      const { rows, outputs } = await run('#test_vector_proc', 'callProcedure', (request) => {
        request.addParameter('in', TYPES.Vector, new Float32Array([1, -2, 3]));
        request.addOutputParameter('out', TYPES.Vector, null, { length: 3 });
        request.addOutputParameter('nullOut', TYPES.Vector, null, { length: 2 });
      });

      assert.instanceOf(rows[0][0], Float32Array);
      assert.deepEqual(Array.from(rows[0][0] as Float32Array), [1, -2, 3]);
      assert.strictEqual(rows[0][1], 6);
      assert.instanceOf(outputs.out.value, Float32Array);
      assert.deepEqual(Array.from(outputs.out.value as Float32Array), [1, -2, 3]);
      assert.strictEqual(outputs.out.metadata.baseType, 'float32');
      assert.strictEqual(outputs.out.metadata.dimensions, 3);
      assert.isNull(outputs.nullOut.value);
    });

    it('should call a procedure with float16 vector input and output parameters', async function() {
      const Float16Array = (globalThis as { Float16Array?: new (values: number[]) => ArrayLike<number> }).Float16Array;
      // `float16` vectors require vector support version 2 and `Float16Array`.
      if (connection.vectorSupportVersion < 2 || !Float16Array) {
        this.skip();
      }

      await run(`
        CREATE PROCEDURE #test_vector16_proc @in vector(3, float16), @out vector(3, float16) OUTPUT
        AS
        SET @out = @in
      `, 'execSqlBatch');

      const { outputs } = await run('#test_vector16_proc', 'callProcedure', (request) => {
        request.addParameter('in', TYPES.Vector, new Float16Array([1, 2.5, -3]));
        request.addOutputParameter('out', TYPES.Vector, null, { length: 3, baseType: 'float16' });
      });

      assert.instanceOf(outputs.out.value, Float16Array);
      assert.deepEqual(Array.from(outputs.out.value as ArrayLike<number>), [1, 2.5, -3]);
      assert.strictEqual(outputs.out.metadata.baseType, 'float16');
    });
  });
});
