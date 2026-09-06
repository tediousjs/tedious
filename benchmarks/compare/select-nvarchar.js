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
    connection.batch('CREATE TABLE #benchmark ([value] nvarchar(max))', (err) => {
      if (err) {
        throw err;
      }

      connection.execute('INSERT INTO #benchmark ([value]) VALUES (@value)', [
        { name: 'value', type: 'nvarchar', value: 'a'.repeat(size) }
      ], (err) => {
        if (err) {
          throw err;
        }

        let i = 0;

        bench.start();

        (function next() {
          connection.execute('SELECT * FROM #benchmark', [], (err, rows) => {
            if (err) {
              throw err;
            }

            if (rows.length !== 1) {
              throw new Error(`expected 1 row, got ${rows.length}`);
            }

            if (++i === n) {
              bench.end(n);
              connection.close(() => {});
              return;
            }

            next();
          });
        })();
      });
    });
  });
}
