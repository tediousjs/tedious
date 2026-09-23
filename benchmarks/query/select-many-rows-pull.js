const { createBenchmark, createConnection } = require('../common');

const { Request, TYPES } = require('tedious');

const bench = createBenchmark(main, {
  n: [10, 100, 1000],
  size: [10, 100, 1000, 10000]
});

function main({ n, size }) {
  createConnection(function(connection) {
    const request = new Request('CREATE TABLE #benchmark ([id] int IDENTITY(1,1), [name] nvarchar(100), [description] nvarchar(max))', (err) => {
      if (err) {
        throw err;
      }

      (function insertNext(num, done) {
        var request = new Request('INSERT INTO #benchmark ([name], [description]) VALUES (@name, @description)', (err) => {
          if (err) {
            throw err;
          }

          if (num === size) {
            done();
          } else {
            insertNext(num + 1, done);
          }
        });

        request.addParameter('name', TYPES.NVarChar, 'Row ' + n);
        request.addParameter('description', TYPES.NVarChar, 'Example Test Description for Row ' + n);

        connection.execSql(request);
      })(0, (err) => {
        let i = 0;

        bench.start();

        (async function() {
          for (let i = 0; i < n; i++) {
            const request = new Request('SELECT * FROM #benchmark');
            connection.execSql(request);

            for await (const row of request.rows()) {
              row.get(0);
              row.get(1);
              await row.read(2);
            }

            await request.finish();
          }

          bench.end(n);
          connection.close();
        })();
      });
    });

    connection.execSqlBatch(request);
  });
}
