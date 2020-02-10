var Connection = require('./src/tedious').Connection;
var Request = require('./src/tedious').Request;
var TYPES = require('./src/tedious').TYPES;
const fs = require('fs');

const config = JSON.parse(
    fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')
  ).config;

var connection = new Connection(config);

connection.on('connect', function(err) {
    // If no error, then good to go...
    executeStatement();
  }
);

connection.on('debug', function(text) {
    //console.log(text);
  }
);

//12345567
function executeStatement() {
  let request = new Request("select * from varbins where col3=@inpt", function(err, rowCount) {
    if (err) {
      console.log(err);
    } else {
      console.log(rowCount + ' rows');
    }

    connection.close();
  });

  request.addParameter('inpt', TYPES.VarChar, 'hello', {length: 8001});


  request.on('row', function(columns) {
    columns.forEach(function(column) {
      if (column.value === null) {
        console.log('NULL');
      } else {
        console.log( 'col value',column.value);
      }
    });
  });

  request.on('done', function(rowCount, more) {
    console.log(rowCount + ' rows returned');
  });

  // In SQL Server 2000 you may need: connection.execSqlBatch(request);
  connection.execSql(request);
}
