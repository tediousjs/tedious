const fs = require('fs');
const Connection = require('../../src/connection');
const Request = require('../../src/request');
const TYPES = require('../../src/data-type').typeByName;

const debugMode = false;

function getConfig() {
  const config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config;
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
    connection.on('infoMessage', (info) => console.log('Info: ' + info.number + ' - ' + info.message));
    connection.on('errorMessage', (error) => console.log('Error: ' + error.number + ' - ' + error.message));
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
  const bulkLoad = connection.newBulkLoad('#tmpTestTable', function(err, rowCount) {
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
  const bulkLoad = connection.newBulkLoad('#tmpTestTable2', function(err, rowCount) {
    test.ok(err, 'An error should have been thrown to indicate the incorrect table format.');
    test.done();
  });
  bulkLoad.addColumn('x', TYPES.Int, {
    nullable: false
  });
  bulkLoad.addColumn('y', TYPES.Int, {
    nullable: false
  });
  const request = new Request('CREATE TABLE #tmpTestTable2 ([id] int not null)', function(err) {
    test.ifError(err);
    bulkLoad.addRow({
      x: 1,
      y: 1
    });
    connection.execBulkLoad(bulkLoad);
  });
  connection.execSqlBatch(request);
};
