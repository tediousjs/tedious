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

const Connection = require('tedious').Connection;
const Request = require('tedious').Request;
const TYPES = require('tedious').TYPES;

const config = {
  server: '192.168.1.212',
  authentication:{
      type:'default',
      options:{
          userName: 'test',
          password: 'test'
      }
  },
  options: {
      port: 1433 //Default Port
  }
};

var connection = new Connection(config);

const storedProcedure = '[dbo].[test_proced]'

connection.on('connect', function(err) {
  if(err){
    console.log('Connection Failed!');
    throw err;
  }
  createStoredProcedure();
});

//Creating new procedure called [dbo].[test_proced]
//--------------------------------------------------------------------------------
function createStoredProcedure(){
  const sql = `CREATE PROCEDURE ${storedProcedure}
                  @inputVal varchar(30),
                  @outputCount int OUTPUT
                AS
                  set @outputCount = LEN(@inputVal);`

  const request = new Request(sql, (err) => {
    if(err){
      throw err;
    } else {
      console.log(`${storedProcedure} created!`)
      callProcedureWithParameters();
    }
  })

  connection.execSql(request);
}

//Calling procedure with Input and Output Parameters
//--------------------------------------------------------------------------------
function callProcedureWithParameters(){
   var request = new Request(storedProcedure,
    function(err) {
      if (err) {
        console.log(err);
      }
      console.log('DONE!')
      connection.close();
    });

  request.addParameter('inputVal', TYPES.VarChar, 'hello world');
  request.addOutputParameter('outputCount', TYPES.Int);

  request.on('returnValue', function(paramName, value, metadata) {
    console.log(paramName + ' : ' + value);
  });

  connection.callProcedure(request);
}