const Connection = require('tedious').Connection;
const Request = require('tedious').Request;
const TYPES = require('tedious').TYPES;

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

const table = '[dbo].[test_param]';

connection.on('connect', (err) => {
  if (err) {
    console.log('Connection Failed!');
    throw err;
  }
  createTable();
});

// Creating new table called [dbo].[test_param]
//--------------------------------------------------------------------------------
function createTable() {
  const request = new Request(`CREATE TABLE ${table} ( uniqueIdCol uniqueidentifier, intCol int, nVarCharCol nvarchar(50))`, (err, rowCount) => {
    if (err) {
      throw err;
    } else {
      console.log('Table Created with ', rowCount, ' rows');
      console.log(`${table} created!.`);
      inputParameters();
    }
  });

  connection.execSql(request);
}

// using input parameters
//--------------------------------------------------------------------------------
function inputParameters() {
  // Values contain variables idicated by '@' sign
  const sql = `INSERT INTO ${table} (uniqueIdCol, intCol, nVarCharCol) VALUES (@uniqueIdVal, @intVal, @nVarCharVal)`;

  const request = new Request(sql, (err, rowCount) => {
    if (err) {
      throw err;
    } else {
      console.log('rowCount: ', rowCount);
      console.log('input parameters success!');
      outputParameters();
    }
  });

  // Setting values to the variables. Note: first argument matches name of variable above.
  request.addParameter('uniqueIdVal', TYPES.UniqueIdentifier, 'ba46b824-487b-4e7d-8fb9-703acdf954e5');
  request.addParameter('intVal', TYPES.Int, 435);
  request.addParameter('nVarCharVal', TYPES.NVarChar, 'hello world');

  connection.execSql(request);
}

// using output parameters
//--------------------------------------------------------------------------------
function outputParameters() {
  const sql = 'SELECT @uniqueIdVal=uniqueIdCol, @intVal=intCol, @nVarCharVal=nVarCharCol from test_param';
  const request = new Request(sql, (err, rowCount) => {
    if (err) {
      throw err;
    } else {
      console.log('output parameters success!');
      console.log('DONE!');
      connection.close();
    }
  });

  // Emits 'returnValue' when executed.
  request.addOutputParameter('uniqueIdVal', TYPES.UniqueIdentifier);
  request.addOutputParameter('intVal', TYPES.Int);
  request.addOutputParameter('nVarCharVal', TYPES.NVarChar);


  request.on('returnValue', (paramName, value, metadata) => {
    console.log(paramName + '=', value);
  });

  connection.execSql(request);
}
