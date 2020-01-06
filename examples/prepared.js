const { Connection, Request, TYPES } = require('../lib/tedious');

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

const table = '[dbo].[test_prepared]';

connection.on('connect', (err) => {
  if (err) {
    console.log('Connection Failed!');
    throw err;
  } else {
    createTable();
  }
});

// Creating new table called [dbo].[MyTable]
//--------------------------------------------------------------------------------
function createTable() {
  const sql = `CREATE TABLE ${table} (c1 int, c2 int)`;
  const request = new Request(sql, (err, rowCount) => {
    if (err) {
      throw err;
    }

    console.log(`'${table}' created!`);
    prepareSQL();
  });

  connection.execSql(request);
}

// Preparing and Executing a SQL
//--------------------------------------------------------------------------------
function prepareSQL() {
  const sql = `INSERT INTO ${table} VALUES (@val1, @val2)`;

  const request = new Request(sql, (err, rowCount) => {
    if (err) {
      throw err;
    }

    executePreparedSQL(request);
  });

  // Must add parameters
  request.addParameter('val1', TYPES.Int);
  request.addParameter('val2', TYPES.Int);

  request.on('prepared', () => {
    console.log('request prepared');
  });

  connection.prepare(request);
}

function executePreparedSQL(request) {
  connection.execute(request, { val1: 1, val2: 2 });

  request.on('requestCompleted', () => {
    console.log('DONE!');
    connection.close();
  });
}
