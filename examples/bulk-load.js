/*
Sample for bulk insert
- with options that enables nullable default column
TSQL for table used:
    CREATE TABLE [dbo].[test_bulk](
    [c1] [int]  DEFAULT 58,
    [c2] [varchar](30)
    )
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

const table = '[dbo].[test_bulk]';

// Creating new table called [dbo].[test_bulk]
//--------------------------------------------------------------------------------
connection.connect((err) => {
  if (err) {
    console.log('Connection Failed');
    throw err;
  }

  createTable();
});

function createTable() {
  const sql = `CREATE TABLE ${table} ([c1] [int]  DEFAULT 58, [c2] [varchar](30))`;
  const request = new Request(sql, (err) => {
    if (err) {
      throw err;
    }

    console.log(`'${table}' created!`);
    loadBulkData();
  });

  connection.execSql(request);
}


// Executing Bulk Load
//--------------------------------------------------------------------------------
function loadBulkData() {
  const option = { keepNulls: true }; // option to enable null values
  const bulkLoad = connection.newBulkLoad(table, option, (err, rowCont) => {
    if (err) {
      throw err;
    }

    console.log('rows inserted :', rowCont);
    console.log('DONE!');
    connection.close();
  });

  // setup columns
  bulkLoad.addColumn('c1', TYPES.Int, { nullable: true });
  bulkLoad.addColumn('c2', TYPES.NVarChar, { length: 50, nullable: true });

  // add rows
  bulkLoad.addRow({ c1: 1 });
  bulkLoad.addRow({ c1: 2, c2: 'hello' });

  // perform bulk insert
  connection.execBulkLoad(bulkLoad);
}
