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

describe('Bulk Load Tests', function() {
  this.timeout(60000);
  let connection;

  beforeEach(function(done) {
    connection = new Connection(getConfig());
    connection.on('connect', done);

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

  it('should bulk load', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable', function(
      err,
      rowCount
    ) {
      if (err) {
        return done(err);
      }

      assert.strictEqual(rowCount, 5, 'Incorrect number of rows inserted.');

      done();
    });

    bulkLoad.addColumn('nnn', TYPES.Int, {
      nullable: false
    });
    bulkLoad.addColumn('sss', TYPES.NVarChar, {
      length: 50,
      nullable: true
    });
    bulkLoad.addColumn('ddd', TYPES.DateTime, {
      nullable: false
    });
    const request = new Request(bulkLoad.getTableCreationSql(), function(err) {
      if (err) {
        return done(err);
      }

      bulkLoad.addRow({
        nnn: 201,
        sss: 'one zero one',
        ddd: new Date(1986, 6, 20)
      });
      bulkLoad.addRow([202, 'one zero two', new Date()]);
      bulkLoad.addRow(203, 'one zero three', new Date(2013, 7, 12));
      bulkLoad.addRow({
        nnn: 204,
        sss: 'one zero four',
        ddd: new Date()
      });
      bulkLoad.addRow({
        nnn: 205,
        sss: 'one zero five',
        ddd: new Date()
      });
      connection.execBulkLoad(bulkLoad);
    });
    connection.execSqlBatch(request);
  });

  it('should bulkLoadError', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable2', function(
      err,
      rowCount
    ) {
      assert.ok(
        err,
        'An error should have been thrown to indicate the incorrect table format.'
      );

      done();
    });
    bulkLoad.addColumn('x', TYPES.Int, {
      nullable: false
    });
    bulkLoad.addColumn('y', TYPES.Int, {
      nullable: false
    });
    const request = new Request(
      'CREATE TABLE #tmpTestTable2 ([id] int not null)',
      function(err) {
        if (err) {
          return done(err);
        }

        bulkLoad.addRow({
          x: 1,
          y: 1
        });
        connection.execBulkLoad(bulkLoad);
      }
    );
    connection.execSqlBatch(request);
  });

  it('should bulkload verify constraints', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable3', { checkConstraints: true }, function(err, rowCount) {
      assert.ok(
        err,
        'An error should have been thrown to indicate the conflict with the CHECK constraint.'
      );
      done();
    });
    bulkLoad.addColumn('id', TYPES.Int, {
      nullable: true
    });
    const request = new Request(`
    CREATE TABLE #tmpTestTable3 ([id] int,  CONSTRAINT chk_id CHECK (id BETWEEN 0 and 50 ))
  `, function(err) {
      if (err) {
        return done(err);
      }

      bulkLoad.addRow({
        id: 555
      });
      connection.execBulkLoad(bulkLoad);
    });
    connection.execSqlBatch(request);
  });

  it('should bulkload verify trigger', function(done) {
    const bulkLoad = connection.newBulkLoad('testTable4', { fireTriggers: true }, function(err, rowCount) {
      if (err) {
        return done(err);
      }

      connection.execSql(request_verify);
    });
    bulkLoad.addColumn('id', TYPES.Int, {
      nullable: true
    });
    const createTable = 'CREATE TABLE testTable4 ([id] int);';
    const createTrigger = `
      CREATE TRIGGER bulkLoadTest on testTable4
      AFTER INSERT
      AS
      INSERT INTO testTable4 SELECT * FROM testTable4;
    `;
    const verifyTrigger = 'SELECT COUNT(*) FROM testTable4';
    const dropTable = 'DROP TABLE testTable4';

    const request_table = new Request(createTable, function(err) {
      if (err) {
        return done(err);
      }

      connection.execSql(request_trigger);
    });

    const request_trigger = new Request(createTrigger, function(err) {
      if (err) {
        return done(err);
      }

      bulkLoad.addRow({
        id: 555
      });
      connection.execBulkLoad(bulkLoad);
    });

    const request_verify = new Request(verifyTrigger, function(err) {
      if (err) {
        return done(err);
      }

      connection.execSql(request_dropTable);
    });

    const request_dropTable = new Request(dropTable, function(err) {
      if (err) {
        return done(err);
      }

      done();
    });

    request_verify.on('row', function(columns) {
      assert.deepEqual(columns[0].value, 2);
    });

    connection.execSql(request_table);
  });

  it('should bulkload verify null value', function(done) {
    const bulkLoad = connection.newBulkLoad('#tmpTestTable5', { keepNulls: true }, function(
      err,
      rowCount
    ) {
      if (err) {
        return done(err);
      }

      connection.execSqlBatch(request_verifyBulkLoad);
    });
    bulkLoad.addColumn('id', TYPES.Int, {
      nullable: true
    });
    const request = new Request(`
      CREATE TABLE #tmpTestTable5 ([id] int NULL DEFAULT 253565)
    `, function(err) {
      if (err) {
        return done(err);
      }

      bulkLoad.addRow({
        id: null
      });
      connection.execBulkLoad(bulkLoad);
    });
    const request_verifyBulkLoad = new Request('SELECT [id] FROM #tmpTestTable5', function(err) {
      if (err) {
        return done(err);
      }

      done();
    });
    request_verifyBulkLoad.on('row', function(columns) {
      assert.deepEqual(columns[0].value, null);
    });
    connection.execSqlBatch(request);
  });

  it('should bulkload cancel after request send does nothing', function(done) {

    const bulkLoad = connection.newBulkLoad('#tmpTestTable5', { keepNulls: true }, function(err, rowCount) {
      assert.ok(err);
      assert.strictEqual(err.message, 'Canceled.');

      connection.execSqlBatch(request_verifyBulkLoad);
    });

    bulkLoad.addColumn('id', TYPES.Int, {
      nullable: true
    });

    const request = new Request('CREATE TABLE #tmpTestTable5 ([id] int NULL DEFAULT 253565)', function(err) {
      if (err) {
        return done(err);
      }
      bulkLoad.addRow({ id: 1234 });
      connection.execBulkLoad(bulkLoad);
      bulkLoad.cancel();
    });

    const request_verifyBulkLoad = new Request('SELECT [id] FROM #tmpTestTable5', function(err, rowCount) {
      if (err) {
        return done(err);
      }

      assert.strictEqual(rowCount, 0);

      done();
    });

    request_verifyBulkLoad.on('row', function(columns) {
      assert.deepEqual(columns[0].value, null);
    });

    connection.execSqlBatch(request);
  });

  it('should bulkload cancel after request completed', function(done) {

    const bulkLoad = connection.newBulkLoad('#tmpTestTable5', { keepNulls: true }, function(err, rowCount) {
      if (err) {
        return done(err);
      }

      bulkLoad.cancel();

      connection.execSqlBatch(request_verifyBulkLoad);
    });

    bulkLoad.addColumn('id', TYPES.Int, {
      nullable: true
    });

    const request = new Request('CREATE TABLE #tmpTestTable5 ([id] int NULL DEFAULT 253565)', function(err) {
      if (err) {
        return done(err);
      }

      bulkLoad.addRow({ id: 1234 });
      connection.execBulkLoad(bulkLoad);
    });

    const request_verifyBulkLoad = new Request('SELECT [id] FROM #tmpTestTable5', function(err, rowCount) {
      if (err) {
        return done(err);
      }

      assert.strictEqual(rowCount, 1);

      done();
    });

    request_verifyBulkLoad.on('row', function(columns) {
      assert.strictEqual(columns[0].value, 1234);
    });

    connection.execSqlBatch(request);
  });

  it('should test stream bulk load', function(done) {
    this.timeout(50000);

    const totalRows = 500000;
    const tableName = '#streamingBulkLoadTest';

    connection.on('error', done);
    startCreateTable();

    function startCreateTable() {
      const sql = 'create table ' + tableName + ' (i int not null primary key)';
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
      const bulkLoad = connection.newBulkLoad(tableName, completeBulkLoad);
      bulkLoad.addColumn('i', TYPES.Int, { nullable: false });
      const rowStream = bulkLoad.getRowStream();
      connection.execBulkLoad(bulkLoad);

      let rowCount = 0;
      const rowSource = new Readable({
        objectMode: true,

        read() {
          while (rowCount < totalRows) {
            const i = rowCount++;
            const row = [i];

            if (!this.push(row)) {
              return;
            }
          }

          this.push(null);
        }
      });

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

      assert.equal(rowCount, 1);
      done();
    }
  });

  it('should test streaming bulk load with cancel', function(done) {
    this.timeout(50000);

    const totalRows = 500000;

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
      const rowSource = new Readable({
        objectMode: true,

        read() {
          process.nextTick(() => {
            while (rowCount < totalRows) {
              if (rowCount === 10000) {
                bulkLoad.cancel();
              }

              const i = rowCount++;
              const row = [i];

              if (!this.push(row)) {
                return;
              }
            }

            this.push(null);
          });
        }
      });

      pipeline(rowSource, rowStream, function(err) {
        assert.ok(err);
        assert.strictEqual(err.message, 'Canceled.');
        assert.strictEqual(rowCount, 10000);
      });
    }

    function completeBulkLoad(err, rowCount) {
      assert.ok(err);
      assert.strictEqual(err.message, 'Canceled.');

      assert.equal(rowCount, 0);
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
});
