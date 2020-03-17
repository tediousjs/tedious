var Connection = require('../../src/connection');
var Request = require('../../src/request');
var fs = require('fs');
var async = require('async');

function getConfig() {
  return JSON.parse(
    fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')
  ).config;
}

exports.smallRows = function(test) {
  var rows = 50000;

  var createTableSql =
    'create table #many_rows (id int, first_name varchar(20), last_name varchar(20))';
  var insertRowSql =
    "\
insert into #many_rows (id, first_name, last_name) values(@count, 'MyFirstName', 'YourLastName')\
";

  createInsertSelect(test, rows, createTableSql, insertRowSql);
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

  createInsertSelect(test, rows, createTableSql, insertRowSql);
};

function createInsertSelect(test, rows, createTableSql, insertRowSql) {
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

  function createTable(callback) {
    var request = new Request(createTableSql, function(err, rowCount) {
      callback(err);
    });

    console.log('Creating table');
    connection.execSqlBatch(request);
  }

  function insertRows(callback) {
    var request = new Request(insertRowsSql, function(err, rowCount) {
      callback(err);
    });

    console.log('Inserting rows');
    connection.execSqlBatch(request);
  }

  function select(callback) {
    var start = Date.now();
    var request = new Request(selectSql, function(err, rowCount) {
      test.strictEqual(rows, rowCount);

      var durationMillis = Date.now() - start;
      console.log(`Took ${durationMillis / 1000}s`);
      console.log(`${rows / (durationMillis / 1000)} rows/sec`);
      console.log(
        `${rows * insertRowSql.length / (durationMillis / 1000)} bytes/sec`
      );

      callback(err);
    });

    request.on('row', function(columns) {
      // console.log(columns[0].value)
    });

    console.log('Selecting rows');
    connection.execSqlBatch(request);
  }

  connection.on('connect', function(err) {
    test.ok(!err);

    async.series([
      createTable,
      insertRows,
      select,
      function() {
        connection.close();
      },
    ]);
  });

  connection.on('end', function(info) {
    test.done();
  });

  connection.on('infoMessage', function(info) {
    // console.log("#{info.number} : #{info.message}")
  });

  connection.on('errorMessage', function(error) {
    // console.log("#{error.number} : #{error.message}")
  });

  connection.on('debug', function(text) {
    // console.log(text)
  });
}
