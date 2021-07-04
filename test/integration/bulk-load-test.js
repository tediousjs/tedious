const fs = require('fs');
const { pipeline, Readable } = require('readable-stream');
const Connection = require('../../src/connection');
const Request = require('../../src/request');
const TYPES = require('../../src/data-type').typeByName;
const assert = require('chai').assert;

const debugMode = false;

function getConfig() {
  const { config } = JSON.parse(
    fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')
  );

  config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;

  config.options.cancelTimeout = 1000;

  if (debugMode) {
    config.options.debug = {
      packet: true,
      data: true,
      payload: true,
      token: true
    };
  }

  return config;
}

describe('BulkLoad', function() {
  /**
   * @type {Connection}
   */
  let connection;

  beforeEach(function(done) {
    connection = new Connection(getConfig());
    connection.connect(done);

    if (debugMode) {
      connection.on('debug', (message) => console.log(message));
      connection.on('infoMessage', (info) =>
        console.log('Info: ' + info.number + ' - ' + info.message)
      );
      connection.on('errorMessage', (error) =>
        console.log('Error: ' + error.number + ' - ' + error.message)
      );
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

  it('allows bulk loading multiple rows', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable', (err, rowCount) => {
      if (err) {
        return done(err);
      }

      assert.strictEqual(rowCount, 5, 'Incorrect number of rows inserted.');

      done();
    });

    bulkLoad.addColumn('nnn', TYPES.Int, { nullable: false });
    bulkLoad.addColumn('sss', TYPES.NVarChar, { length: 50, nullable: true });
    bulkLoad.addColumn('ddd', TYPES.DateTime, { nullable: false });

    const request = new Request(bulkLoad.getTableCreationSql(), (err) => {
      if (err) {
        return done(err);
      }

      bulkLoad.addRow({ nnn: 201, sss: 'one zero one', ddd: new Date(1986, 6, 20) });
      bulkLoad.addRow([202, 'one zero two', new Date()]);
      bulkLoad.addRow(203, 'one zero three', new Date(2013, 7, 12));
      bulkLoad.addRow({ nnn: 204, sss: 'one zero four', ddd: new Date() });
      bulkLoad.addRow({ nnn: 205, sss: 'one zero five', ddd: new Date() });

      connection.execBulkLoad(bulkLoad);
    });

    connection.execSqlBatch(request);
  });

  it('supports exotic table and column names', function(done) {
    const bulkLoad = connection.newBulkLoad('#[😀]', (err, rowCount) => {
      if (err) {
        return done(err);
      }

      assert.strictEqual(rowCount, 5, 'Incorrect number of rows inserted.');

      done();
    });

    bulkLoad.addColumn('column # @ []', TYPES.Int, { nullable: false });
    bulkLoad.addColumn('foo"bar"baz', TYPES.NVarChar, { length: 50, nullable: true });
    bulkLoad.addColumn('😀', TYPES.DateTime, { nullable: false });

    const request = new Request(bulkLoad.getTableCreationSql(), (err) => {
      if (err) {
        return done(err);
      }

      bulkLoad.addRow({ 'column # @ []': 201, 'foo"bar"baz': 'one zero one', '😀': new Date(1986, 6, 20) });
      bulkLoad.addRow([202, 'one zero two', new Date()]);
      bulkLoad.addRow(203, 'one zero three', new Date(2013, 7, 12));
      bulkLoad.addRow({ 'column # @ []': 204, 'foo"bar"baz': 'one zero four', '😀': new Date() });
      bulkLoad.addRow({ 'column # @ []': 205, 'foo"bar"baz': 'one zero five', '😀': new Date() });

      connection.execBulkLoad(bulkLoad);
    });

    connection.execSqlBatch(request);
  });

  it('fails if the column definition does not match the target table format', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable2', (err, rowCount) => {
      assert.instanceOf(err, Error, 'An error should have been thrown to indicate the incorrect table format.');
      assert.isUndefined(rowCount);

      done();
    });

    bulkLoad.addColumn('x', TYPES.Int, { nullable: false });
    bulkLoad.addColumn('y', TYPES.Int, { nullable: false });

    const request = new Request('CREATE TABLE #tmpTestTable2 ([id] int not null)', (err) => {
      if (err) {
        return done(err);
      }

      bulkLoad.addRow({ x: 1, y: 1 });

      connection.execBulkLoad(bulkLoad);
    });

    connection.execSqlBatch(request);
  });

  it('checks constraints if the `checkConstraints` option is set to `true`', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable3', { checkConstraints: true }, (err, rowCount) => {
      assert.ok(err, 'An error should have been thrown to indicate the conflict with the CHECK constraint.');

      assert.strictEqual(rowCount, 0);

      done();
    });

    bulkLoad.addColumn('id', TYPES.Int, { nullable: true });

    const request = new Request('CREATE TABLE #tmpTestTable3 ([id] int,  CONSTRAINT chk_id CHECK (id BETWEEN 0 and 50 ))', (err) => {
      if (err) {
        return done(err);
      }

      bulkLoad.addRow({ id: 50 });
      bulkLoad.addRow({ id: 555 });
      bulkLoad.addRow({ id: 5 });

      connection.execBulkLoad(bulkLoad);
    });

    connection.execSqlBatch(request);
  });

  it('fires triggers if the `fireTriggers` option is set to `true`', function(done) {
    const bulkLoad = connection.newBulkLoad('testTable4', { fireTriggers: true }, (err, rowCount) => {
      if (err) {
        return done(err);
      }

      connection.execSql(verifyTriggerRequest);
    });

    bulkLoad.addColumn('id', TYPES.Int, { nullable: true });

    const createTable = 'CREATE TABLE testTable4 ([id] int);';
    const createTrigger = `
      CREATE TRIGGER bulkLoadTest on testTable4
      AFTER INSERT
      AS
      INSERT INTO testTable4 SELECT * FROM testTable4;
    `;
    const verifyTrigger = 'SELECT COUNT(*) FROM testTable4';
    const dropTable = 'DROP TABLE testTable4';

    const createTableRequest = new Request(createTable, (err) => {
      if (err) {
        return done(err);
      }

      connection.execSql(createTriggerRequest);
    });

    const createTriggerRequest = new Request(createTrigger, (err) => {
      if (err) {
        return done(err);
      }

      bulkLoad.addRow({
        id: 555
      });

      connection.execBulkLoad(bulkLoad);
    });

    const verifyTriggerRequest = new Request(verifyTrigger, (err) => {
      if (err) {
        return done(err);
      }

      connection.execSql(dropTableRequest);
    });

    const dropTableRequest = new Request(dropTable, (err) => {
      if (err) {
        return done(err);
      }

      done();
    });

    verifyTriggerRequest.on('row', (columns) => {
      assert.deepEqual(columns[0].value, 2);
    });

    connection.execSql(createTableRequest);
  });

  it('should not replace `null` values with column defaults if `keepNulls` is set to `true`', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable5', { keepNulls: true }, (err, rowCount) => {
      if (err) {
        return done(err);
      }

      connection.execSqlBatch(verifyBulkLoadRequest);
    });

    bulkLoad.addColumn('id', TYPES.Int, { nullable: true });

    const request = new Request('CREATE TABLE #tmpTestTable5 ([id] int NULL DEFAULT 253565)', (err) => {
      if (err) {
        return done(err);
      }

      bulkLoad.addRow({ id: null });

      connection.execBulkLoad(bulkLoad);
    });

    const verifyBulkLoadRequest = new Request('SELECT [id] FROM #tmpTestTable5', (err) => {
      if (err) {
        return done(err);
      }

      done();
    });

    verifyBulkLoadRequest.on('row', (columns) => {
      assert.deepEqual(columns[0].value, null);
    });

    connection.execSqlBatch(request);
  });

  it('does not insert any rows if `cancel` is called immediately after executing the bulk load', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable5', { keepNulls: true }, (err, rowCount) => {
      assert.instanceOf(err, Error);
      assert.strictEqual(err.message, 'Canceled.');

      assert.isUndefined(rowCount);

      connection.execSqlBatch(verifyBulkLoadRequest);
    });

    bulkLoad.addColumn('id', TYPES.Int, {
      nullable: true
    });

    const request = new Request('CREATE TABLE #tmpTestTable5 ([id] int NULL DEFAULT 253565)', (err) => {
      if (err) {
        return done(err);
      }
      bulkLoad.addRow({ id: 1234 });

      connection.execBulkLoad(bulkLoad);

      bulkLoad.cancel();
    });

    const verifyBulkLoadRequest = new Request('SELECT [id] FROM #tmpTestTable5', (err, rowCount) => {
      if (err) {
        return done(err);
      }

      assert.strictEqual(rowCount, 0);

      done();
    });

    verifyBulkLoadRequest.on('row', (columns) => {
      assert.deepEqual(columns[0].value, null);
    });

    connection.execSqlBatch(request);
  });

  it('should not do anything if canceled after completion', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable5', { keepNulls: true }, (err, rowCount) => {
      if (err) {
        return done(err);
      }

      bulkLoad.cancel();

      connection.execSqlBatch(verifyBulkLoadRequest);
    });

    bulkLoad.addColumn('id', TYPES.Int, { nullable: true });

    const request = new Request('CREATE TABLE #tmpTestTable5 ([id] int NULL DEFAULT 253565)', (err) => {
      if (err) {
        return done(err);
      }

      bulkLoad.addRow({ id: 1234 });

      connection.execBulkLoad(bulkLoad);
    });

    const verifyBulkLoadRequest = new Request('SELECT [id] FROM #tmpTestTable5', (err, rowCount) => {
      if (err) {
        return done(err);
      }

      assert.strictEqual(rowCount, 1);

      done();
    });

    verifyBulkLoadRequest.on('row', function(columns) {
      assert.strictEqual(columns[0].value, 1234);
    });

    connection.execSqlBatch(request);
  });

  it('should not close the connection due to cancelTimeout if canceled after completion', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable5', { keepNulls: true }, (err, rowCount) => {
      if (err) {
        return done(err);
      }

      bulkLoad.cancel();

      setTimeout(() => {
        assert.strictEqual(connection.state.name, 'LoggedIn');

        const request = new Request('select 1', done);

        connection.execSql(request);
      }, connection.config.options.cancelTimeout + 100);
    });

    bulkLoad.addColumn('id', TYPES.Int, { nullable: true });

    bulkLoad.addRow({ id: 1234 });

    const createTableRequest = new Request('CREATE TABLE #tmpTestTable5 ([id] int NULL DEFAULT 253565)', (err) => {
      if (err) {
        return done(err);
      }

      connection.execBulkLoad(bulkLoad);
    });

    connection.execSqlBatch(createTableRequest);
  });

  it('supports streaming bulk load inserts', function(done) {
    const totalRows = 20;
    const tableName = '#streamingBulkLoadTest';

    startCreateTable();

    function startCreateTable() {
      const sql = 'create table ' + tableName + ' (i int not null primary key)';
      const request = new Request(sql, (err) => {
        if (err) {
          return done(err);
        }

        startBulkLoad();
      });

      connection.execSqlBatch(request);
    }

    function startBulkLoad() {
      const bulkLoad = connection.newBulkLoad(tableName, completeBulkLoad);
      bulkLoad.addColumn('i', TYPES.Int, { nullable: false });
      const rowStream = bulkLoad.getRowStream();

      connection.execBulkLoad(bulkLoad);

      const rowSource = Readable.from((async function*() {
        let rowCount = 0;
        while (rowCount < totalRows) {
          await new Promise((resolve) => {
            setTimeout(resolve, 10);
          });

          yield [rowCount++];
        }
      })(), { objectMode: true });

      rowSource.pipe(rowStream);
    }

    function completeBulkLoad(err, rowCount) {
      if (err) {
        return done(err);
      }

      assert.equal(rowCount, totalRows);
      startVerifyTableContent();
    }

    function startVerifyTableContent() {
      const request = new Request(`
        select count(*)
        from ${tableName} a
        inner join ${tableName} b on a.i = b.i - 1
      `, completeVerifyTableContent);

      request.on('row', (row) => {
        assert.equal(row[0].value, totalRows - 1);
      });

      connection.execSqlBatch(request);
    }

    function completeVerifyTableContent(err, rowCount) {
      if (err) {
        return done(err);
      }

      assert.strictEqual(rowCount, 1);

      done();
    }
  });

  it('supports cancelling a streaming bulk load', function(done) {
    const totalRows = 20;

    startCreateTable();

    function startCreateTable() {
      const sql = 'create table #stream_test (i int not null primary key)';
      const request = new Request(sql, completeCreateTable);
      connection.execSqlBatch(request);
    }

    function completeCreateTable(err) {
      if (err) {
        return done(err);
      }

      startBulkLoad();
    }

    function startBulkLoad() {
      const bulkLoad = connection.newBulkLoad('#stream_test', completeBulkLoad);
      bulkLoad.addColumn('i', TYPES.Int, { nullable: false });

      const rowStream = bulkLoad.getRowStream();
      connection.execBulkLoad(bulkLoad);

      let rowCount = 0;
      const rowSource = Readable.from((async function*() {
        while (rowCount < totalRows) {
          if (rowCount === 10) {
            bulkLoad.cancel();
          }

          await new Promise((resolve) => {
            setTimeout(resolve, 10);
          });

          yield [rowCount++];
        }
      })(), { objectMode: true });

      pipeline(rowSource, rowStream, (err) => {
        assert.ok(err);
        assert.strictEqual(err.message, 'Canceled.');
        assert.strictEqual(rowCount, 10);
      });
    }

    function completeBulkLoad(err, rowCount) {
      assert.ok(err);
      assert.strictEqual(err.message, 'Canceled.');

      assert.strictEqual(rowCount, 0);
      startVerifyTableContent();
    }

    function startVerifyTableContent() {
      const sql = `
        select count(*)
        from #stream_test a
        inner join #stream_test b on a.i = b.i - 1
      `;
      const request = new Request(sql, completeVerifyTableContent);
      request.on('row', (row) => {
        assert.equal(row[0].value, 0);
      });
      connection.execSqlBatch(request);
    }

    function completeVerifyTableContent(err, rowCount) {
      if (err) {
        return done(err);
      }

      assert.equal(rowCount, 1);

      done();
    }
  });

  it('should not close the connection due to cancelTimeout if streaming bulk load is cancelled', function(done) {
    const totalRows = 20;

    const sql = 'create table #stream_test (i int not null primary key)';
    const request = new Request(sql, (err) => {
      if (err) {
        return done(err);
      }

      const bulkLoad = connection.newBulkLoad('#stream_test', (err, rowCount) => {
        assert.ok(err);
        assert.strictEqual(err.message, 'Canceled.');

        assert.strictEqual(rowCount, 0);
      });

      bulkLoad.addColumn('i', TYPES.Int, { nullable: false });

      const rowStream = bulkLoad.getRowStream();
      connection.execBulkLoad(bulkLoad);

      let rowCount = 0;
      const rowSource = Readable.from((async function*() {
        while (rowCount < totalRows) {
          if (rowCount === 10) {
            bulkLoad.cancel();

            setTimeout(() => {
              assert.strictEqual(connection.state.name, 'LoggedIn');

              const request = new Request('select 1', done);

              connection.execSql(request);
            }, connection.config.options.cancelTimeout + 100);
          }

          await new Promise((resolve) => {
            setTimeout(resolve, 10);
          });

          yield [rowCount++];
        }
      })(), { objectMode: true });

      pipeline(rowSource, rowStream, (err) => {
        assert.ok(err);
        assert.strictEqual(err.message, 'Canceled.');
        assert.strictEqual(rowCount, 10);
      });
    });

    connection.execSqlBatch(request);
  });

  it('cancels any bulk load that takes longer than the given timeout', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable5', { keepNulls: true }, (err, rowCount) => {
      assert.instanceOf(err, Error);
      assert.strictEqual(err.name, 'RequestError');
      assert.strictEqual(err.message, 'Timeout: Request failed to complete in 10ms');

      done();
    });

    bulkLoad.setTimeout(10);

    bulkLoad.addColumn('id', TYPES.Int, {
      nullable: true
    });

    const request = new Request('CREATE TABLE #tmpTestTable5 ([id] int NULL DEFAULT 253565)', (err) => {
      if (err) {
        return done(err);
      }

      for (let i = 0; i < 100000; i++) {
        bulkLoad.addRow({ id: 1234 });
      }

      connection.execBulkLoad(bulkLoad);
    });

    connection.execSqlBatch(request);
  });

  it('does nothing if the timeout fires after the bulk load completes', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable5', { keepNulls: true }, (err, rowCount) => {
      assert.isUndefined(err);

      done();
    });

    bulkLoad.setTimeout(2000);

    bulkLoad.addColumn('id', TYPES.Int, {
      nullable: true
    });

    const request = new Request('CREATE TABLE #tmpTestTable5 ([id] int NULL DEFAULT 253565)', (err) => {
      if (err) {
        return done(err);
      }

      for (let i = 0; i < 100; i++) {
        bulkLoad.addRow({ id: 1234 });
      }

      connection.execBulkLoad(bulkLoad);
    });

    connection.execSqlBatch(request);
  });

  it('cancels any streaming bulk load that takes longer than the given timeout', function(done) {
    startCreateTable();

    function startCreateTable() {
      const sql = 'create table #stream_test (i int not null primary key)';
      const request = new Request(sql, completeCreateTable);
      connection.execSqlBatch(request);
    }

    function completeCreateTable(err) {
      if (err) {
        return done(err);
      }

      startBulkLoad();
    }

    function startBulkLoad() {
      const bulkLoad = connection.newBulkLoad('#stream_test', completeBulkLoad);
      bulkLoad.setTimeout(200);

      bulkLoad.addColumn('i', TYPES.Int, { nullable: false });

      const rowStream = bulkLoad.getRowStream();

      connection.execBulkLoad(bulkLoad);

      const rowSource = Readable.from((async function*() {
        yield [1];

        await new Promise((resolve) => {
          setTimeout(resolve, 500);
        });

        yield [2];
      })(), { objectMode: true });

      pipeline(rowSource, rowStream, (err) => {
        assert.ok(err);
        assert.strictEqual(err.message, 'Canceled.');
      });
    }

    function completeBulkLoad(err, rowCount) {
      assert.ok(err);
      assert.strictEqual(err.message, 'Timeout: Request failed to complete in 200ms');

      assert.strictEqual(rowCount, 0);

      done();
    }
  });
});

describe('Bulk Loads when `config.options.validateBulkLoadParameters` is `true`', () => {
  let connection;

  beforeEach(function(done) {
    const config = getConfig();
    config.options = { ...config.options, validateBulkLoadParameters: true };
    connection = new Connection(config);
    connection.connect(done);

    if (debugMode) {
      connection.on('debug', (message) => console.log(message));
      connection.on('infoMessage', (info) =>
        console.log('Info: ' + info.number + ' - ' + info.message)
      );
      connection.on('errorMessage', (error) =>
        console.log('Error: ' + error.number + ' - ' + error.message)
      );
    }
  });

  beforeEach(function(done) {
    const request = new Request('create table #stream_test ([value] date)', (err) => {
      done(err);
    });

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

  it('should handle validation errors during streaming bulk loads', (done) => {
    const bulkLoad = connection.newBulkLoad('#stream_test', completeBulkLoad);
    bulkLoad.addColumn('value', TYPES.Date, { nullable: false });

    const rowStream = bulkLoad.getRowStream();
    connection.execBulkLoad(bulkLoad);

    const rowSource = Readable.from([
      ['invalid date']
    ]);

    pipeline(rowSource, rowStream, (err) => {
      assert.ok(err);
      assert.strictEqual(err.message, 'Invalid date.');
    });

    function completeBulkLoad(err, rowCount) {
      assert.ok(err);
      assert.strictEqual(err.message, 'Invalid date.');

      done();
    }
  });

  it('should allow reusing the connection after validation errors during streaming bulk loads', (done) => {
    const bulkLoad = connection.newBulkLoad('#stream_test', completeBulkLoad);
    bulkLoad.addColumn('value', TYPES.Date, { nullable: false });

    const rowStream = bulkLoad.getRowStream();
    connection.execBulkLoad(bulkLoad);

    const rowSource = Readable.from([ ['invalid date'] ]);

    pipeline(rowSource, rowStream, (err) => {
      assert.ok(err);
      assert.strictEqual(err.message, 'Invalid date.');
    });

    function completeBulkLoad(err, rowCount) {
      assert.ok(err);
      assert.strictEqual(err.message, 'Invalid date.');

      assert.strictEqual(rowCount, 0);

      const rows = [];
      const request = new Request('SELECT 1', (err) => {
        assert.ifError(err);

        assert.deepEqual([1], rows);

        done();
      });

      request.on('row', (row) => {
        rows.push(row[0].value);
      });

      connection.execSql(request);
    }
  });
});
