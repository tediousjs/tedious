const { Connection, Request, TYPES } = require('../lib/tedious');

var config = {
  "server": "localhost",
  "authentication": {
    "type": "default",
    "options": {
      "userName": "sa",
      "password": "Password1"
    }
  },
  "options": {
    "port": 1433,
    "database": "master",
    "trustServerCertificate": true
  }
}

const connection = new Connection(config);

connection.on('connect', (err) => {
  if (err) {
    console.log('Connection Failed');
    throw err;
  }

  executeStatement();
});

connection.connect();

function executeStatement() {
  const request = new Request('select CAST(@param as smalldatetime(max))', (err, rowCount) => {
    if (err) {
      console.log('>>> ERROR CAUGHT')
      throw err;
    }

    console.log('DONE!');
    connection.close();
  });

  request.addParameter('param', TYPES.SmallDateTime, 'January 1, 1899 10:04:00')

  request.on('done', (rowCount) => {
    console.log('Done is called!');
  });

  request.on('doneInProc', (rowCount, more) => {
    console.log(rowCount + ' rows returned');
  });

  // In SQL Server 2000 you may need: connection.execSqlBatch(request);
  connection.execSql(request);
}
