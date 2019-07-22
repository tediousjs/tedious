var Connection = require('../lib/tedious').Connection;
var Request = require('../lib/tedious').Request;
 
var config = {
  server: '192.168.1.212',
  authentication: {
    type: 'default',
    options: {
      userName: 'test',
      password: 'test',
    }
  },
  options: {
    port: 1433 //Default Port
  }
};

var connection = new Connection(config);

connection.on('connect', function(err) {
    if(err) {
      console.log('Connection Failed');
      throw err
    } else {
      executeStatement();
    }
  }
);


function executeStatement() {
  request = new Request("select 42, 'hello world'", function(err, rowCount) {
    if (err) {
      console.log(err);
      throw err;
    } else {
      console.log('DONE!')
    }
    connection.close();
  });

  //Emits a 'DoneInProc' event when completed.
  request.on('row', function(columns) {
    columns.forEach(function(column) {
      if (column.value === null) {
        console.log('NULL');
      } else {
        console.log(column.value);
      }
    });
  });

  request.on('doneInProc', function(rowCount, more) {
    console.log(rowCount + ' rows returned');
  });

  // In SQL Server 2000 you may need: connection.execSqlBatch(request);
  connection.execSql(request);
}
