'use strict';

const { createBenchmark } = require('../common');
const { DRIVERS, connect } = require('../drivers');

const bench = createBenchmark(main, {
  driver: DRIVERS,
  n: [10, 100]
});

const TYPE_NAME = `TediousBenchmarkType_${process.pid}`;
const PROCEDURE_NAME = `TediousBenchmarkTvp_${process.pid}`;

function main({ driver, n }) {
  connect(driver, (connection) => {
    // User defined table types cannot be created as temporary objects, so
    // create (and later drop) uniquely named objects in tempdb instead.
    connection.batch(`
      USE tempdb;

      DROP PROCEDURE IF EXISTS ${PROCEDURE_NAME};
      DROP TYPE IF EXISTS ${TYPE_NAME};

      CREATE TYPE ${TYPE_NAME} AS TABLE (
        FileId uniqueidentifier,
        FileNumber bigint,
        FileVersion varchar(20),
        FileCommitID varchar(40),
        FileModel nvarchar(max)
      );
    `, (err) => {
      if (err) {
        throw err;
      }

      connection.batch(`
        CREATE PROCEDURE ${PROCEDURE_NAME} @tvp ${TYPE_NAME} readonly AS BEGIN select COUNT(*) from @tvp END
      `, (err) => {
        if (err) {
          throw err;
        }

        const tvp = {
          name: 'tvp',
          type: 'tvp',
          typeName: TYPE_NAME,
          columns: [
            { name: 'FileId', type: 'uniqueidentifier' },
            { name: 'FileNumber', type: 'bigint' },
            { name: 'FileVersion', type: 'varchar', length: 20 },
            { name: 'FileCommitID', type: 'varchar', length: 40 },
            { name: 'FileModel', type: 'nvarchar', length: Infinity }
          ],
          rows: []
        };

        for (let i = 0; i < 500; i++) {
          tvp.rows.push([
            '6F9619FF-8B86-D011-B42D-00C04FC964FF',
            1,
            '12345',
            '6b8bd41619d843b35b13478bb8aa88ea67039a05',
            new Array(5000).join('x')
          ]);
        }

        // Warm up once so that metadata lookups performed by the drivers
        // (e.g. procedure and type metadata) are not part of the measurement.
        call((err) => {
          if (err) {
            throw err;
          }

          let i = 0;

          bench.start();

          (function next() {
            call((err) => {
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

        function call(callback) {
          connection.callProcedure(`dbo.${PROCEDURE_NAME}`, [tvp], callback);
        }

        function cleanup() {
          connection.batch(`
            DROP PROCEDURE IF EXISTS ${PROCEDURE_NAME};
            DROP TYPE IF EXISTS ${TYPE_NAME};
          `, (err) => {
            if (err) {
              throw err;
            }

            connection.close(() => {});
          });
        }
      });
    });
  });
}
