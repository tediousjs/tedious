'use strict';

const { createBenchmark } = require('../common');
const { DRIVERS, connect } = require('../drivers');

const bench = createBenchmark(main, {
  driver: DRIVERS,
  n: [10, 100],
  size: [10, 100, 1000, 10000]
});

// msnodesqlv8 resolves bulk insert column metadata from the catalog views,
// which does not work for temporary tables, so use a uniquely named regular
// table in tempdb for all drivers instead.
const TABLE_NAME = `TediousBenchmarkBulk_${process.pid}`;
const QUALIFIED_TABLE_NAME = `tempdb.dbo.${TABLE_NAME}`;

function main({ driver, n, size }) {
  connect(driver, (connection) => {
    connection.batch(`
      DROP TABLE IF EXISTS ${QUALIFIED_TABLE_NAME};

      CREATE TABLE ${QUALIFIED_TABLE_NAME} (
        "id" int NOT NULL
      );
    `, (err) => {
      if (err) {
        throw err;
      }

      const columns = [
        { name: 'id', type: 'int', nullable: false }
      ];

      const rows = [];
      for (let j = 0; j < size; j++) {
        rows.push({ id: j });
      }

      // Warm up once so that table metadata lookups performed by the drivers
      // are not part of the measurement.
      load((err) => {
        if (err) {
          throw err;
        }

        let i = 0;

        bench.start();

        (function next() {
          load((err) => {
            if (err) {
              throw err;
            }

            if (++i === n) {
              bench.end(n);
              cleanup();
              return;
            }

            next();
          });
        })();
      });

      function load(callback) {
        connection.bulkLoad(QUALIFIED_TABLE_NAME, columns, rows, callback);
      }

      function cleanup() {
        connection.batch(`DROP TABLE IF EXISTS ${QUALIFIED_TABLE_NAME}`, (err) => {
          if (err) {
            throw err;
          }

          connection.close(() => {});
        });
      }
    });
  });
}
