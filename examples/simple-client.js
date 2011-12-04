var Connection = require('../lib/tedious').Connection;
var Request = require('../lib/tedious').Request;
var fs = require('fs');

var config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8'))

config.options.timeout = 30 * 1000;
config.options.debug = {
  data: true,
  payload: false,
  token: false,
  packet: true
}

var connection = new Connection(config.server, config.userName, config.password, config.options, connected);

connection.on('infoMessage', infoError);
connection.on('errorMessage', infoError);
connection.on('timeout', timeout);
connection.on('closed', closed);
connection.on('debug', debug);

function connected(err, loggedIn) {
  if (err) {
    console.log(err);
    process.exit(1);
  }
  
  //console.log('connected');

  process.stdin.resume();
  
  process.stdin.on('data', function (chunk) {
    exec(chunk);
  });
  
  process.stdin.on('end', function () {
    process.exit(0);
  });
}

function exec(sql) {
  sql = sql.toString();

  request = new Request(sql, statementComplete)
  request.on('columnMetadata', columnMetadata);
  request.on('row', row);

  connection.execSql(request);
}

function statementComplete(err, rowCount) {
  if (err) {
    //console.log('Statement failed: ' + err);
  } else {
    console.log(rowCount + ' rows');
  }
}

function closed() {
  console.log('Connection closed');
  process.exit(0);
}

function timeout() {
  console.log('Connection timeout');
}

function infoError(info) {
  console.log(info.number + ' : ' + info.message);
}

function debug(message) {
  console.log(message);
}

function columnMetadata(columnsMetadata) {
  columnsMetadata.forEach(function(column) {
    //console.log(column);
  });
}

function row(columns) {
  var values = '';
  
  columns.forEach(function(column) {
    if (column.isNull) {
      value = 'NULL';
    } else {
      value = column.value;
    }
    
    values += value + '\t';
  });

  console.log(values);
}
    // test.strictEqual(columnsMetadata.length, 3)
  // )
//   
  // connection.on('row', (columns) ->


  // connection.on('databaseChange', (database) ->
    // test.strictEqual(database, config.options.database)
  // )
// 
  // connection.on('debug', (message) ->
    // #console.log(message)
  // )
// 
// exports.execSimpleSql = (test) ->
  // test.expect(15)
// 
  // connection = new Connection(config.server, config.userName, config.password, config.options, (err, loggedIn) ->
    // test.ok(!err)
    // test.ok(loggedIn)
//     
    // connection.execSql("select 8 as C1, 'abc' as C2, N'def' as C3", (err, rowCount) ->
      // test.ok(!err)
      // test.strictEqual(rowCount, 1)
      // test.done()
    // )
  // )
//   
  // connection.on('columnMetadata', (columnsMetadata) ->
    // test.strictEqual(columnsMetadata.length, 3)
  // )
//   
  // connection.on('row', (columns) ->
    // test.strictEqual(columns.length, 3)
// 
    // test.strictEqual(columns[0].value, 8)
    // test.strictEqual(columns[1].value, 'abc')
    // test.strictEqual(columns[2].value, 'def')
// 
    // test.strictEqual(columns[0].isNull, false)
    // test.strictEqual(columns[1].isNull, false)
    // test.strictEqual(columns[2].isNull, false)
//     
    // byName = columns.byName()
    // test.strictEqual(byName.C1.value, 8)
    // test.strictEqual(byName.C2.value, 'abc')
    // test.strictEqual(byName.C3.value, 'def')
  // )
// 
  // connection.on('debug', (message) ->
    // #console.log(message)
  // )

