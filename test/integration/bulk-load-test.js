const fs = require('fs');
const { pipeline, Readable } = require('readable-stream');
const Connection = require('../../src/connection');
const Request = require('../../src/request');
const TYPES = require('../../src/data-type').typeByName;

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

exports.setUp = function(setUpDone) {
  const connection = new Connection(getConfig());
  connection.on('connect', (err) => {
    if (err) {
      setUpDone(err);
      return;
    }
    this.connection = connection;
    setUpDone();
  });
  connection.on('end', () => {
    this.connection = undefined;
  });
  if (debugMode) {
    connection.on('debug', (message) => console.log(message));
    connection.on('infoMessage', (info) =>
      console.log('Info: ' + info.number + ' - ' + info.message)
    );
    connection.on('errorMessage', (error) =>
      console.log('Error: ' + error.number + ' - ' + error.message)
    );
  }
};

exports.tearDown = function(tearDownDone) {
  const connection = this.connection;
  if (!connection) {
    tearDownDone();
    return;
  }
  connection.on('end', function() {
    tearDownDone();
  });
  connection.close();
};

exports.bulkLoad = function(test) {
  const connection = this.connection;
  const bulkLoad = connection.newBulkLoad('#tmpTestTable', function(
    err,
    rowCount
  ) {
    test.ifError(err);
    test.strictEqual(rowCount, 5, 'Incorrect number of rows inserted.');
    test.done();
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
    test.ifError(err);
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
};

exports.bulkLoadError = function(test) {
  const connection = this.connection;
  const bulkLoad = connection.newBulkLoad('#tmpTestTable2', function(
    err,
    rowCount
  ) {
    test.ok(
      err,
      'An error should have been thrown to indicate the incorrect table format.'
    );
    test.done();
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
      test.ifError(err);
      bulkLoad.addRow({
        x: 1,
        y: 1
      });
      connection.execBulkLoad(bulkLoad);
    }
  );
  connection.execSqlBatch(request);
};

exports['bulkLoad - verify constraints'] = function(test) {
  const connection = this.connection;
  const bulkLoad = connection.newBulkLoad('#tmpTestTable3', {checkConstraints: true}, function(
    err,
    rowCount
  ) {
    test.ok(
      err,
      'An error should have been thrown to indicate the conflict with the CHECK constraint.'
    );
    test.done();
  });
  bulkLoad.addColumn('id', TYPES.Int, {
    nullable: true
  });
  const request = new Request(
    'CREATE TABLE #tmpTestTable3 ([id] int,  CONSTRAINT chk_id CHECK (id BETWEEN 0 and 50 ))',
    function(err) {
      test.ifError(err);
      bulkLoad.addRow({
        id: 555
      });
      connection.execBulkLoad(bulkLoad);
    }
  );
  connection.execSqlBatch(request);
};

exports['bulkLoad - verify trigger'] = function(test) {
  test.expect(6);
  const connection = this.connection;
  const bulkLoad = connection.newBulkLoad('testTable4', {fireTriggers: true}, function(
    err,
    rowCount
  ) {
    test.ifError(err);
    connection.execSql(request_verify);
  });
  bulkLoad.addColumn('id', TYPES.Int, {
    nullable: true
  });
  const createTable = 'CREATE TABLE testTable4 ([id] int);';
  const createTrigger =
    `CREATE TRIGGER bulkLoadTest on testTable4
    AFTER INSERT
    AS
    INSERT INTO testTable4 SELECT * FROM testTable4;`;
  const verifyTrigger = 'SELECT COUNT(*) FROM testTable4';
  const dropTable = 'DROP TABLE testTable4';

  const request_table = new Request(createTable,
    function(err) {
      test.ifError(err);
      connection.execSql(request_trigger);
    }
  );

  const request_trigger = new Request(createTrigger,
    function(err) {
      test.ifError(err);
      bulkLoad.addRow({
        id: 555
      });
      connection.execBulkLoad(bulkLoad);
    }
  );

  const request_verify = new Request(verifyTrigger, function(err) {
    test.ifError(err);
    connection.execSql(request_dropTable);
  });

  const request_dropTable = new Request(dropTable, function(err) {
    test.ifError(err);
    test.done();
  });

  request_verify.on('row', function(columns) {
    test.deepEqual(columns[0].value, 2);
  });

  connection.execSql(request_table);
};

exports['bulkLoad - verify null value'] = function(test) {
  const connection = this.connection;
  const bulkLoad = connection.newBulkLoad('#tmpTestTable5', {keepNulls: true}, function(
    err,
    rowCount
  ) {
    test.ifError(err);
    connection.execSqlBatch(request_verifyBulkLoad);
  });
  bulkLoad.addColumn('id', TYPES.Int, {
    nullable: true
  });
  const request = new Request(
    'CREATE TABLE #tmpTestTable5 ([id] int NULL DEFAULT 253565)',
    function(err) {
      test.ifError(err);
      bulkLoad.addRow({
        id: null
      });
      connection.execBulkLoad(bulkLoad);
    }
  );
  const request_verifyBulkLoad = new Request('SELECT [id] FROM #tmpTestTable5', function(err) {
    test.ifError(err);
    test.done();
  });
  request_verifyBulkLoad.on('row', function(columns) {
    test.deepEqual(columns[0].value, null);
  });
  connection.execSqlBatch(request);
};

exports['bulkLoad - cancel after request send does nothing'] = function(test) {
  const connection = this.connection;

  const bulkLoad = connection.newBulkLoad('#tmpTestTable5', { keepNulls: true }, function(err, rowCount) {
    test.ok(err);
    test.strictEqual(err.message, 'Canceled.');

    connection.execSqlBatch(request_verifyBulkLoad);
  });

  bulkLoad.addColumn('id', TYPES.Int, {
    nullable: true
  });

  const request = new Request('CREATE TABLE #tmpTestTable5 ([id] int NULL DEFAULT 253565)', function(err) {
    test.ifError(err);
    bulkLoad.addRow({ id: 1234 });
    connection.execBulkLoad(bulkLoad);
    bulkLoad.cancel();
  });

  const request_verifyBulkLoad = new Request('SELECT [id] FROM #tmpTestTable5', function(err, rowCount) {
    test.ifError(err);

    test.strictEqual(rowCount, 0);

    test.done();
  });

  request_verifyBulkLoad.on('row', function(columns) {
    test.deepEqual(columns[0].value, null);
  });

  connection.execSqlBatch(request);
};

exports['bulkLoad - cancel after request completed'] = function(test) {
  const connection = this.connection;

  const bulkLoad = connection.newBulkLoad('#tmpTestTable5', {keepNulls: true}, function(err, rowCount) {
    test.ifError(err);

    bulkLoad.cancel();

    connection.execSqlBatch(request_verifyBulkLoad);
  });

  bulkLoad.addColumn('id', TYPES.Int, {
    nullable: true
  });

  const request = new Request('CREATE TABLE #tmpTestTable5 ([id] int NULL DEFAULT 253565)', function(err) {
    test.ifError(err);
    bulkLoad.addRow({ id: 1234 });
    connection.execBulkLoad(bulkLoad);
  });

  const request_verifyBulkLoad = new Request('SELECT [id] FROM #tmpTestTable5', function(err, rowCount) {
    test.ifError(err);

    test.strictEqual(rowCount, 1);

    test.done();
  });

  request_verifyBulkLoad.on('row', function(columns) {
    test.strictEqual(columns[0].value, 1234);
  });

  connection.execSqlBatch(request);
};


exports.testStreamingBulkLoad = function(test) {
  const totalRows = 500000;
  const connection = this.connection;
  const tableName = '#streamingBulkLoadTest';

  connection.on('error', function(err) {
    test.ifError(err);
  });
  startCreateTable();

  function startCreateTable() {
    const sql = 'create table ' + tableName + ' (i int not null primary key)';
    const request = new Request(sql, completeCreateTable);
    connection.execSqlBatch(request);
  }

  function completeCreateTable(err) {
    test.ifError(err);
    startBulkLoad();
  }

  function startBulkLoad() {
    const bulkLoad = connection.newBulkLoad(tableName, completeBulkLoad);
    bulkLoad.addColumn('i', TYPES.Int, {nullable: false});
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
    test.ifError(err);
    test.equal(rowCount, totalRows);
    startVerifyTableContent();
  }

  function startVerifyTableContent() {
    const sql =
      'select count(*) ' +
        'from ' + tableName + ' a ' +
          'inner join ' + tableName + ' b on a.i = b.i - 1';
    const request = new Request(sql, completeVerifyTableContent);
    request.on('row', (row) => {
      test.equals(row[0].value, totalRows - 1);
    });
    connection.execSqlBatch(request);
  }

  function completeVerifyTableContent(err, rowCount) {
    test.ifError(err);
    test.equal(rowCount, 1);
    test.done();
  }
};

exports.testStreamingBulkLoadWithCancel = function(test) {
  const totalRows = 500000;
  const connection = this.connection;

  startCreateTable();

  function startCreateTable() {
    const sql = 'create table #stream_test (i int not null primary key)';
    const request = new Request(sql, completeCreateTable);
    connection.execSqlBatch(request);
  }

  function completeCreateTable(err) {
    test.ifError(err);
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
      test.ok(err);
      test.strictEqual(err.message, 'Canceled.');
      test.strictEqual(rowCount, 10000);
    });
  }

  function completeBulkLoad(err, rowCount) {
    test.ok(err);
    test.strictEqual(err.message, 'Canceled.');

    test.equal(rowCount, 0);
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
      test.equals(row[0].value, 0);
    });
    connection.execSqlBatch(request);
  }

  function completeVerifyTableContent(err, rowCount) {
    test.ifError(err);
    test.equal(rowCount, 1);
    test.done();
  }
};
