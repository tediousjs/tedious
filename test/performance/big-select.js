var Connection = require('../../src/connection');
var Request = require('../../src/request');
var fs = require('fs');
var async = require('async');

var getConfig = function() {
  return JSON.parse(
    fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')
  ).config;
};

exports.smallRows = function(test) {
  var rows = 50000;

  var createTableSql =
    'create table #many_rows (id int, first_name varchar(20), last_name varchar(20))';
  var insertRowSql = '\
insert into #many_rows (id, first_name, last_name) values(@count, \'MyFirstName\', \'YourLastName\')\
';

  return createInsertSelect(test, rows, createTableSql, insertRowSql);
};

exports.mediumRows = function(test) {
  var rows = 2000;

  var medium = '';
  for (var i = 1; i <= 8000; i++) {
    medium += 'x';
  }

  var createTableSql =
    'create table #many_rows (id int, first_name varchar(20), last_name varchar(20), medium varchar(8000))';
  var insertRowSql = `\
insert into #many_rows (id, first_name, last_name, medium) values(@count, 'MyFirstName', 'YourLastName', '${medium}')\
`;

  return createInsertSelect(test, rows, createTableSql, insertRowSql);
};

var createInsertSelect = function(test, rows, createTableSql, insertRowSql) {
  test.expect(2);

  var insertRowsSql = `\
declare @count int
set @count = ${rows}

while @count > 0
begin
  ${insertRowSql}
  set @count = @count - 1
end\
`;
  var selectSql = 'select * from #many_rows';

  var config = getConfig();
  var connection = new Connection(config);

  var createTable = function(callback) {
    var request = new Request(createTableSql, function(err, rowCount) {
      return callback(err);
    });

    console.log('Creating table');
    return connection.execSqlBatch(request);
  };

  var insertRows = function(callback) {
    var request = new Request(insertRowsSql, function(err, rowCount) {
      return callback(err);
    });

    console.log('Inserting rows');
    return connection.execSqlBatch(request);
  };

  var select = function(callback) {
    var start = Date.now();
    var request = new Request(selectSql, function(err, rowCount) {
      test.strictEqual(rows, rowCount);

      var durationMillis = Date.now() - start;
      console.log(`Took ${durationMillis / 1000}s`);
      console.log(`${rows / (durationMillis / 1000)} rows/sec`);
      console.log(
        `${rows * insertRowSql.length / (durationMillis / 1000)} bytes/sec`
      );

      return callback(err);
    });

    request.on(
      'row',
      function(columns) {}
      //console.log(columns[0].value)
    );

    console.log('Selecting rows');
    return connection.execSqlBatch(request);
  };

  connection.on('connect', function(err) {
    test.ok(!err);

    return async.series([
      createTable,
      insertRows,
      select,
      function() {
        return connection.close();
      }
    ]);
  });

  connection.on('end', function(info) {
    return test.done();
  });

  connection.on(
    'infoMessage',
    function(info) {}
    //console.log("#{info.number} : #{info.message}")
  );

  connection.on(
    'errorMessage',
    function(error) {}
    //console.log("#{error.number} : #{error.message}")
  );

  return connection.on(
    'debug',
    function(text) {}
    //console.log(text)
  );
};
