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

const storedProcedure = '[dbo].[test_sp_tvp]';
const table = '[dbo].[test_tvp]';
const table_type = 'TableType';

connection.on('connect', (err) => {
  if (err) {
    console.log('connection err');
    throw err;
  }

  createTable();
});

// Creating new table called [dbo].[test_proced]
//--------------------------------------------------------------------------------
function createTable() {
  const sql = `
    CREATE TABLE ${table} (
      user_id INT,
      user_name VARCHAR(50),
      user_enabled BIT
    )
  `;

  const request = new Request(sql, (err, rowCount) => {
    if (err) {
      throw err;
    }

    console.log(`'${table}' created!`);
    createTableType();
  });

  connection.execSql(request);
}

// Creating user-defined table type called 'TableType'
//--------------------------------------------------------------------------------
function createTableType() {
  /* Create a table type */
  const defineTypeSql = `
    CREATE TYPE ${table_type} AS TABLE(
        user_id INT,
        user_name VARCHAR(50),
        user_enabled BIT
    );
  `;

  const request = new Request(defineTypeSql, (err) => {
    if (err) {
      console.log('creating table err');
      throw err;
    }

    console.log(`created table type ${table_type}`);
    createStoredProcedure();
  });

  connection.execSql(request);
}

// Creating new stored procedure called [dbo].[test_sp_tvp]
//--------------------------------------------------------------------------------
function createStoredProcedure() {
  const defineProcSql = `
    CREATE PROCEDURE ${storedProcedure}
      @tvp ${table_type} READONLY
    As
    SET NOCOUNT ON
    INSERT INTO test_tvp (
        user_id,
        user_name,
        user_enabled
    )
    SELECT *
    FROM @tvp;
  `;

  const request = new Request(defineProcSql, (err) => {
    if (err) {
      console.log('defining tables and types err!');
      throw err;
    }

    console.log(`created stored procedure ${storedProcedure}`);
    passingTableValue();
  });

  connection.execSqlBatch(request);
}

// Using table valued parameters
//--------------------------------------------------------------------------------
function passingTableValue() {
  /* Setting table value */
  const table = {
    columns: [
      { name: 'user_id', type: TYPES.Int },
      { name: 'user_name', type: TYPES.VarChar, length: 500 },
      { name: 'user_enabled', type: TYPES.Bit }
    ],
    rows: [
      [12, 'Eric', true],
      [13, 'John', false]
    ]
  };

  const request = new Request(`${storedProcedure}`, (err) => {
    if (err) {
      throw err;
    }

    console.log('successfully passed in table value');
    console.log('DONE!');
    connection.close();
  });

  /* Adding table value to parameter */
  request.addParameter('tvp', TYPES.TVP, table);

  connection.callProcedure(request);
}
