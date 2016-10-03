'use strict';

var Connection, Request, TYPES, fs, getConfig;

Connection = require('../../src/connection');

Request = require('../../src/request');

fs = require('fs');

TYPES = require('../../src/data-type').typeByName;

getConfig = function() {
  var config;
  config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config;
  config.options.debug = {
    packet: true,
    data: true,
    payload: true,
    token: false,
    log: true
  };
  return config;
};

exports.bulkLoad = function(test) {
  var config, connection;
  config = getConfig();
  connection = new Connection(config);
  connection.on('connect', function(err) {
    var bulk, request;
    test.ifError(err);
    bulk = connection.newBulkLoad('#tmpTestTable', function(err, rowCount) {
      test.ifError(err);
      test.strictEqual(rowCount, 5, 'Incorrect number of rows inserted.');
      return connection.close();
    });
    bulk.addColumn('nnn', TYPES.Int, {
      nullable: false
    });
    bulk.addColumn('sss', TYPES.NVarChar, {
      length: 50,
      nullable: true
    });
    bulk.addColumn('ddd', TYPES.DateTime, {
      nullable: false
    });
    request = new Request(bulk.getTableCreationSql(), function(err) {
      test.ifError(err);
      bulk.addRow({
        nnn: 201,
        sss: 'one zero one',
        ddd: new Date(1986, 6, 20)
      });
      bulk.addRow([202, 'one zero two', new Date()]);
      bulk.addRow(203, 'one zero three', new Date(2013, 7, 12));
      bulk.addRow({
        nnn: 204,
        sss: 'one zero four',
        ddd: new Date()
      });
      bulk.addRow({
        nnn: 205,
        sss: 'one zero five',
        ddd: new Date()
      });
      return connection.execBulkLoad(bulk);
    });
    return connection.execSqlBatch(request);
  });
  connection.on('end', function(info) {
    return test.done();
  });
  return connection.on('debug', function(text) {});
};

exports.bulkLoadError = function(test) {
  var config, connection;
  config = getConfig();
  connection = new Connection(config);
  connection.on('connect', function(err) {
    var bulk, request;
    test.ifError(err);
    bulk = connection.newBulkLoad('#tmpTestTable2', function(err, rowCount) {
      test.ok(err, 'An error should have been thrown to indicate the incorrect table format.');
      return connection.close();
    });
    bulk.addColumn('x', TYPES.Int, {
      nullable: false
    });
    bulk.addColumn('y', TYPES.Int, {
      nullable: false
    });
    request = new Request('CREATE TABLE #tmpTestTable2 ([id] int not null)', function(err) {
      test.ifError(err);
      bulk.addRow({
        x: 1,
        y: 1
      });
      return connection.execBulkLoad(bulk);
    });
    return connection.execSqlBatch(request);
  });
  connection.on('end', function(info) {
    return test.done();
  });
  return connection.on('debug', function(text) {});
};
