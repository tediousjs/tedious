'use strict';

const { createBenchmark } = require('../common');
const { DRIVERS, connect } = require('../drivers');

const bench = createBenchmark(main, {
  driver: DRIVERS,
  n: [10, 100],
  size: [
    10,
    1024,
    1024 * 1024,
    10 * 1024 * 1024
  ]
});

function main({ driver, n, size }) {
  connect(driver, (connection) => {
    const buf = Buffer.alloc(size, 'x');

    let i = 0;

    bench.start();

    (function next() {
      connection.execute('SELECT DATALENGTH(@value)', [
        { name: 'value', type: 'varbinary', value: buf }
      ], (err) => {
        if (err) {
          throw err;
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
}
