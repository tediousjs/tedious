const fs = require('fs');
const Connection = require('../../src/connection');
const Request = require('../../src/request');
const TYPES = require('../../src/data-type').typeByName;
const BULK_LOAD_OPTIONS = require('../../src/tedious').BULK_LOAD_OPTIONS;

const debugMode = false;

function getConfig() {
  const config = JSON.parse(
    fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')
  ).config;
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

// Test if bulk load honours constraints in the destination table
exports.bulkLoad_Constraint = function(test) {
  const connection = this.connection;
  const bulkLoad = connection.newBulkLoad('#tmpTestTable3', function(
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
  bulkLoad.addOptions(BULK_LOAD_OPTIONS.CHECK_CONSTRAINTS);
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

// Test if bulk load honours trigger dependentant on destination table
exports.bulkLoad_Triggers = function(test) {
  test.expect(4);
  const connection = this.connection;
  const bulkLoad = connection.newBulkLoad('testTable4', function(
    err,
    rowCount
  ) {
    test.ifError(err);
    connection.execSql(request_verify);
  });
  bulkLoad.addColumn('id', TYPES.Int, {
    nullable: true
  });
  bulkLoad.addOptions(BULK_LOAD_OPTIONS.FIRE_TRIGGERS);

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
    connection.execSql(request_dropTable);
  });

  const request_dropTable = new Request(dropTable, function() {
    test.done();
  });

  request_verify.on('row', function(columns) {
    test.deepEqual(columns[0].value, 2);
  });

  connection.execSql(request_table);
};

// test if null value is honoured and retained during BulkLoad
exports.bulkLoad_KeepNull = function(test) {
  const connection = this.connection;
  const bulkLoad = connection.newBulkLoad('#tmpTestTable5', function(
    err,
    rowCount
  ) {
    test.ifError(err);
    connection.execSqlBatch(request_verifyBulkLoad);
  });
  bulkLoad.addColumn('id', TYPES.Int, {
    nullable: true
  });
  bulkLoad.addOptions(BULK_LOAD_OPTIONS.KEEP_NULLS);
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
