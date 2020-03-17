const Connection = require('../../src/connection');
const Request = require('../../src/request');
const TYPES = require('../../src/data-type').typeByName;
const fs = require('fs');
const assert = require('chai').assert;

function getConfig() {
  const config = JSON.parse(
    fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')
  ).config;

  config.options.debug = {
    packet: true,
    data: true,
    payload: true,
    token: true,
    log: true,
  };

  config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;

  return config;
}

function execSqlBatch(connection, sql, doneCallback) {
  const request = new Request(sql, function(err) {
    if (err) {
      console.log(err);
      assert.ok(false);
    }

    doneCallback();
  });

  connection.execSqlBatch(request);
}

function testProc(done, type, typeAsString, value) {
  const config = getConfig();

  const request = new Request('#test_proc', function(err) {
    assert.ifError(err);

    connection.close();
  });

  request.addParameter('param', type, value);

  request.on('doneProc', function(rowCount, more, returnStatus) {
    assert.ok(!more);
    assert.strictEqual(returnStatus, 0);
  });

  request.on('doneInProc', function(rowCount, more) {
    assert.ok(more);
  });

  request.on('row', function(columns) {
    if (value instanceof Date) {
      assert.strictEqual(columns[0].value.getTime(), value.getTime());
    } else {
      assert.strictEqual(columns[0].value, value);
    }
  });

  let connection = new Connection(config);

  connection.on('connect', function(err) {
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
  });

  connection.on('end', function(info) {
    done();
  });

  connection.on(
    'infoMessage',
    function(info) { }
    // console.log("#{info.number} : #{info.message}")
  );

  connection.on('errorMessage', function(error) {
    console.log(`${error.number} : ${error.message}`);
  });

  connection.on(
    'debug',
    function(text) { }
    // console.log(text)
  );
}

function testProcOutput(done, type, typeAsString, value) {
  const config = getConfig();

  const request = new Request('#test_proc', function(err) {
    assert.ifError(err);

    connection.close();
  });

  request.addParameter('paramIn', type, value);
  request.addOutputParameter('paramOut', type);

  request.on('doneProc', function(rowCount, more, returnStatus) {
    assert.ok(!more);
    assert.strictEqual(returnStatus, 0);
  });

  request.on('doneInProc', function(rowCount, more) {
    assert.ok(more);
  });

  request.on('returnValue', function(name, returnValue, metadata) {
    assert.strictEqual(name, 'paramOut');
    if (value instanceof Date) {
      assert.strictEqual(returnValue.getTime(), value.getTime());
    } else {
      assert.strictEqual(returnValue, value);
    }
    assert.ok(metadata);
  });

  let connection = new Connection(config);

  connection.on('connect', function(err) {
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
  });

  connection.on('end', function(info) {
    done();
  });

  connection.on('infoMessage', function(info) {
    // console.log("#{info.number} : #{info.message}")
  });

  connection.on('errorMessage', function(error) {
    console.log(`${error.number} : ${error.message}`);
  });

  connection.on('debug', function(text) {
    // console.log(text)
  });
}


describe('RPC test', function() {
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
      assert.ok(err);

      connection.close();
    });

    request.on('doneProc', function(rowCount, more, returnStatus) {
      assert.ok(!more);
    });

    request.on('doneInProc', function(rowCount, more) {
      assert.ok(more);
    });

    request.on('row', function(columns) {
      assert.ok(false);
    });

    let connection = new Connection(config);

    connection.on('connect', function(err) {
      connection.callProcedure(request);
    });

    connection.on('end', function(info) {
      done();
    });

    connection.on(
      'infoMessage',
      function(info) { }
      // console.log("#{info.number} : #{info.message}")
    );

    connection.on('errorMessage', function(error) {
      // console.log("#{error.number} : #{error.message}")
      assert.ok(error);
    });

    connection.on(
      'debug',
      function(text) { }
      // console.log(text)
    );
  });

  it('should proc return value', function(done) {
    const config = getConfig();

    const request = new Request('#test_proc', function(err) {
      connection.close();
    });

    request.on('doneProc', function(rowCount, more, returnStatus) {
      assert.ok(!more);
      assert.strictEqual(returnStatus, -1); // Non-zero indicates a failure.
    });

    request.on('doneInProc', function(rowCount, more) {
      assert.ok(more);
    });

    let connection = new Connection(config);

    connection.on('connect', function(err) {
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

    connection.on('end', function(info) {
      done();
    });

    connection.on(
      'infoMessage',
      function(info) { }
      // console.log("#{info.number} : #{info.message}")
    );

    connection.on('errorMessage', function(error) {
      // console.log("#{error.number} : #{error.message}")
      assert.ok(error);
    });

    connection.on(
      'debug',
      function(text) { }
      // console.log(text)
    );
  });

});
