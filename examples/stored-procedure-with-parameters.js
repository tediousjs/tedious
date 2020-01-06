/*
Sample to pass/retrieve input/output parameters to stored procedure.
TSQL for stored procedure:
   CREATE PROCEDURE [dbo].[countChar]
   @inputVal varchar(30),
   @outputCount int OUTPUT
   AS
   set @outputCount = LEN(@inputVal);
   GO
*/

const { Connection, Request, TYPES } = require('../lib/tedious');

// Connection configuration to SQL server. (See ../src/connection.js to learn more)
const config = {
  server: '192.168.1.212',
  authentication: {
    type: 'default',
    options: {
      userName: 'test',
      password: 'test'
    }
  },
  options: {
    port: 1433 // Default Port
  }
};


const connection = new Connection(config);

const storedProcedure = '[dbo].[test_proced]';

connection.connect(function(err) {
  if (err) {
    console.log('Connection Failed!');
    throw err;
  }

  createStoredProcedure();
});

// Creating new procedure called [dbo].[test_proced]
//--------------------------------------------------------------------------------
function createStoredProcedure() {
  const sql = `CREATE PROCEDURE ${storedProcedure}
                  @inputVal varchar(30),
                  @outputCount int OUTPUT
                AS
                  set @outputCount = LEN(@inputVal);`;

  const request = new Request(sql, (err) => {
    if (err) {
      throw err;
    }

    console.log(`${storedProcedure} created!`);
    callProcedureWithParameters();
  });

  connection.execSql(request);
}

// Calling procedure with Input and Output Parameters
//--------------------------------------------------------------------------------
function callProcedureWithParameters() {
  const request = new Request(storedProcedure, (err) => {
    if (err) {
      throw err;
    }

    console.log('DONE!');
    connection.close();
  });

  request.addParameter('inputVal', TYPES.VarChar, 'hello world');
  request.addOutputParameter('outputCount', TYPES.Int);

  request.on('returnValue', (paramName, value, metadata) => {
    console.log(paramName + ' : ' + value);
  });

  connection.callProcedure(request);
}
