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
var Connection = require('tedious').Connection,
  Request = require('tedious').Request,
  TYPES = require('tedious').TYPES;

var connection = new Connection({
  server: '192.168.1.212',
  authentication: {
    type: 'default',
    options: {
      userName: 'test',
      password: 'test'
    }
  }
});

connection.on('connect', function(err) {
  var request = new Request('countChar',
    function(err) {
      if (err) {
        console.log(err);
      }

      connection.close();
    });

  request.addParameter('inputVal', TYPES.VarChar, 'hello world');
  request.addOutputParameter('outputCount', TYPES.Int);

  request.on('returnValue', function(paramName, value, metadata) {
    console.log(paramName + ' : ' + value);
  });

  connection.callProcedure(request);
});
