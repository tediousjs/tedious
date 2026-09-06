'use strict';

const { createBenchmark } = require('../common');
const { DRIVERS, connect } = require('../drivers');

const bench = createBenchmark(main, {
  driver: DRIVERS,
  n: [10, 100]
});

function main({ driver, n }) {
  // Warm up (DNS, driver initialisation, ...) before measuring.
  connect(driver, (connection) => {
    connection.close(() => {
      let i = 0;

      bench.start();

      (function next() {
        connect(driver, (connection) => {
          connection.close((err) => {
            if (err) {
              throw err;
            }

            if (++i === n) {
              bench.end(n);
              return;
            }

            next();
          });
        });
      })();
    });
  });
}
