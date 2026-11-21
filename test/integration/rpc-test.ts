import { assert } from 'chai';
import { typeByName as TYPES } from '../../src/data-type';

import Connection, { type ConnectionOptions } from '../../src/connection';
import Request, { type ParameterOptions } from '../../src/request';
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
  let connectionOptions: ConnectionOptions = {};

  beforeEach(function(done) {
    const config = getConfig();
    connection = new Connection({ ...config, options: { ...config.options, ...connectionOptions } });
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

  function testProc(done: Mocha.Done, type: DataType, typeAsString: string, value: unknown, options?: ParameterOptions) {
    let rows = 0;

    const request = new Request('#test_proc', function(err) {
      assert.ifError(err);
      assert.strictEqual(rows, 1);

      done();
    });

    request.addParameter('param', type, value, options);

    request.on('doneProc', function(rowCount, more, returnStatus) {
      assert.isFalse(more);
      assert.strictEqual(returnStatus, 0);
    });

    request.on('doneInProc', function(rowCount, more) {
      assert.isTrue(more);
    });

    request.on('row', function(columns) {
      rows++;

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

  function testProcOutput(done: Mocha.Done, type: DataType, typeAsString: string, value: unknown, options?: ParameterOptions) {
    let returnValues = 0;

    const request = new Request('#test_proc', function(err) {
      assert.ifError(err);
      assert.strictEqual(returnValues, 1);

      done();
    });

    request.addParameter('paramIn', type, value, options);
    request.addOutputParameter('paramOut', type, undefined, options);

    request.on('doneProc', function(rowCount, more, returnStatus) {
      assert.isFalse(more);
      assert.strictEqual(returnStatus, 0);
    });

    request.on('doneInProc', function(rowCount, more) {
      assert.isTrue(more);
    });

    request.on('returnValue', function(name, returnValue, metadata) {
      returnValues++;

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

  describe('with `decimalAsString`', function() {
    before(function() {
      connectionOptions = { decimalAsString: true };
    });

    after(function() {
      connectionOptions = {};
    });

    it('should exec proc decimal of precision 38', function(done) {
      testProc(done, TYPES.Decimal, 'decimal(38, 9)', '12345678901234567.123456789', { precision: 38, scale: 9 });
    });

    it('should exec proc numeric with a fractional scale', function(done) {
      testProc(done, TYPES.Numeric, 'numeric(10, 4)', '-12.3400', { precision: 10, scale: 4 });
    });

    it('should exec proc decimal null', function(done) {
      testProc(done, TYPES.Decimal, 'decimal(38, 9)', null, { precision: 38, scale: 9 });
    });

    it('should exec proc output decimal of precision 38', function(done) {
      testProcOutput(done, TYPES.Decimal, 'decimal(38, 0)', '-99999999999999999999999999999999999999', { precision: 38, scale: 0 });
    });

    it('should exec proc output numeric with a fractional scale', function(done) {
      testProcOutput(done, TYPES.Numeric, 'numeric(38, 28)', '0.0000000000000000000000000001', { precision: 38, scale: 28 });
    });

    it('should exec proc output decimal null', function(done) {
      testProcOutput(done, TYPES.Decimal, 'decimal(38, 9)', null, { precision: 38, scale: 9 });
    });
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

});
