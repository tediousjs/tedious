'use strict';

var Connection, Request, async, createInsertSelect, fs, getConfig;

Connection = require('../../src/connection');

Request = require('../../src/request');

fs = require('fs');

async = require('async');

getConfig = function() {
  return JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config;
};

exports.smallRows = function(test) {
  var createTableSql, insertRowSql, rows;
  rows = 50000;
  createTableSql = 'create table #many_rows (id int, first_name varchar(20), last_name varchar(20))';
  insertRowSql = "insert into #many_rows (id, first_name, last_name) values(@count, 'MyFirstName', 'YourLastName')";
  return createInsertSelect(test, rows, createTableSql, insertRowSql);
};

exports.mediumRows = function(test) {
  var createTableSql, insertRowSql, i, medium, rows;
  rows = 2000;
  medium = '';
  for (i = 1; i <= 8000; ++i) {
    medium += 'x';
  }
  createTableSql = 'create table #many_rows (id int, first_name varchar(20), last_name varchar(20), medium varchar(8000))';
  insertRowSql = "insert into #many_rows (id, first_name, last_name, medium) values(@count, 'MyFirstName', 'YourLastName', '" + medium + "')";
  return createInsertSelect(test, rows, createTableSql, insertRowSql);
};

createInsertSelect = function(test, rows, createTableSql, insertRowSql) {
  var config, connection, createTable, insertRows, insertRowsSql, select, selectSql;
  test.expect(2);
  insertRowsSql = 'declare @count int\nset @count = ' + rows + '\n\nwhile @count > 0\nbegin\n  ' + insertRowSql + '\n  set @count = @count - 1\nend';
  selectSql = 'select * from #many_rows';
  config = getConfig();
  connection = new Connection(config);
  createTable = function(callback) {
    var request;
    request = new Request(createTableSql, function(err, rowCount) {
      return callback(err);
    });
    console.log('Creating table');
    return connection.execSqlBatch(request);
  };
  insertRows = function(callback) {
    var request;
    request = new Request(insertRowsSql, function(err, rowCount) {
      return callback(err);
    });
    console.log('Inserting rows');
    return connection.execSqlBatch(request);
  };
  select = function(callback) {
    var request, start;
    start = Date.now();
    request = new Request(selectSql, function(err, rowCount) {
      var durationMillis;
      test.strictEqual(rows, rowCount);
      durationMillis = Date.now() - start;
      console.log('Took ' + (durationMillis / 1000) + 's');
      console.log((rows / (durationMillis / 1000)) + ' rows/sec');
      console.log(((rows * insertRowSql.length) / (durationMillis / 1000)) + ' bytes/sec');
      return callback(err);
    });
    request.on('row', function(columns) {});
    console.log('Selecting rows');
    return connection.execSqlBatch(request);
  };
  connection.on('connect', function(err) {
    test.ok(!err);
    return async.series([
      createTable, insertRows, select, function() {
        return connection.close();
      }
    ]);
  });
  connection.on('end', function(info) {
    return test.done();
  });
  connection.on('infoMessage', function(info) {});
  connection.on('errorMessage', function(error) {});
  return connection.on('debug', function(text) {});
};
