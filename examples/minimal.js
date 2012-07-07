var Connection = require('../lib/tedious').Connection;
var Request = require('../lib/tedious').Request;

var config = {
  server: '192.168.1.212',
  userName: 'test',
  password: 'test'
  /*
  ,options: {
    debug: {
      packet: true,
      data: true,
      payload: true,
      token: false,
      log: true
    }
  }
  */
};

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

function executeStatement() {
  request = new Request("select 42, 'hello world'", function(err, rowCount) {
    if (err) {
      console.log(err);
    } else {
      console.log(rowCount + ' rows');
    }

    connection.close();
  });

  request.on('row', function(columns) {
    columns.forEach(function(column) {
      if (column.value === null) {
        console.log('NULL');
      } else {
        console.log(column.value);
      }
    });
  });

  request.on('done', function(rowCount, more) {
    console.log(rowCount + ' rows returned');
  });

  // In SQL Server 2000 you may need: connection.execSqlBatch(request);
  connection.execSql(request);
}
