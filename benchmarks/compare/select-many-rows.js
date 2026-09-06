'use strict';

const { createBenchmark } = require('../common');
const { DRIVERS, connect } = require('../drivers');

const bench = createBenchmark(main, {
  driver: DRIVERS,
  n: [10, 100, 1000],
  size: [10, 100, 1000, 10000]
});

function main({ driver, n, size }) {
  connect(driver, (connection) => {
    connection.batch('CREATE TABLE #benchmark ([id] int IDENTITY(1,1), [name] nvarchar(100), [description] nvarchar(max))', (err) => {
      if (err) {
        throw err;
      }

      (function insertNext(num) {
        if (num === size) {
          return run();
        }

        connection.execute('INSERT INTO #benchmark ([name], [description]) VALUES (@name, @description)', [
          { name: 'name', type: 'nvarchar', value: 'Row ' + num },
          { name: 'description', type: 'nvarchar', value: 'Example Test Description for Row ' + num }
        ], (err) => {
          if (err) {
            throw err;
          }

          insertNext(num + 1);
        });
      })(0);

      function run() {
        let i = 0;

        bench.start();

        (function next() {
          connection.execute('SELECT * FROM #benchmark', [], (err, rows) => {
            if (err) {
              throw err;
            }

            if (rows.length !== size) {
              throw new Error(`expected ${size} rows, got ${rows.length}`);
            }

            if (++i === n) {
              bench.end(n);
              connection.close(() => {});
              return;
            }

            next();
          });
        })();
      }
    });
  });
}
