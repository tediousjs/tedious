/*
Sample for the `vector` data type (SQL Server 2025, Azure SQL)
- bulk loads vectors, queries them with a vector parameter, and reads them back
TSQL for table used:
    CREATE TABLE [dbo].[test_vectors](
    [id] [int] NOT NULL,
    [embedding] [vector](3) NULL
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
    port: 1433, // Default Port
    // Native vector support is negotiated by default ('v2'). With 'off',
    // vectors are returned as JSON text, as by older versions of tedious.
    vectorTypeSupport: 'v2'
  }
};

const connection = new Connection(config);

const table = '[dbo].[test_vectors]';

connection.connect((err) => {
  if (err) {
    console.log('Connection Failed');
    throw err;
  }

  createTable();
});

function createTable() {
  const sql = `CREATE TABLE ${table} ([id] [int] NOT NULL, [embedding] [vector](3) NULL)`;
  const request = new Request(sql, (err) => {
    if (err) {
      throw err;
    }

    console.log(`'${table}' created!`);
    loadVectors();
  });

  connection.execSqlBatch(request);
}

// Bulk load vectors. The number of dimensions of a vector column is given as
// its `length`. Values are arrays of numbers or `Float32Array`s.
function loadVectors() {
  const bulkLoad = connection.newBulkLoad(table, (err, rowCount) => {
    if (err) {
      throw err;
    }

    console.log('rows inserted :', rowCount);
    findNearest();
  });

  bulkLoad.addColumn('id', TYPES.Int, { nullable: false });
  bulkLoad.addColumn('embedding', TYPES.Vector, { length: 3, nullable: true });

  connection.execBulkLoad(bulkLoad, [
    { id: 1, embedding: [0.1, 0.2, 0.3] },
    { id: 2, embedding: new Float32Array([0.9, 0.8, 0.7]) },
    { id: 3, embedding: null }
  ]);
}

// Query with a vector parameter. Its dimensions are inferred from the value;
// a null vector parameter needs `{ length: <dimensions> }`.
function findNearest() {
  const sql = `
    SELECT TOP (2) id, embedding, VECTOR_DISTANCE('cosine', embedding, @query) AS distance
    FROM ${table}
    WHERE embedding IS NOT NULL
    ORDER BY distance`;

  const request = new Request(sql, (err) => {
    if (err) {
      throw err;
    }

    console.log('DONE!');
    connection.close();
  });

  request.addParameter('query', TYPES.Vector, [0.1, 0.2, 0.25]);

  request.on('row', (columns) => {
    const [id, embedding, distance] = columns;
    // `embedding.value` is an array of numbers; `embedding.metadata.precision`
    // is the number of dimensions.
    console.log(id.value, embedding.value, embedding.metadata.precision, distance.value);
  });

  connection.execSql(request);
}
