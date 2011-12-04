var Connection = require('../lib/tedious').Connection;
var Request = require('../lib/tedious').Request;

var options = {};

var connection = new Connection('192.168.1.210', 'test', 'test', options,
  function(err, loggedIn) {
    // If no error, then good to go...
    executeStatement()
  }
)

function executeStatement() {
  request = new Request("select 42, 'hello world'", function(err, rowCount) {
    console.log(rowCount + ' rows returned');
  });

  request.on('row', function(columns) {
    columns.forEach(function(column) {
      if (column.isNull) {
        console.log('NULL');
      } else {
        console.log(column.value);
      }
    });
  });

  connection.execSql(request);
}
