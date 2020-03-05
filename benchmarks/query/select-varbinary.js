const { createBenchmark, createConnection } = require('../common');

const { Request, TYPES } = require('../../lib/tedious');

const bench = createBenchmark(main, {
  n: [10, 100],
  size: [
    10,
    1024,
    1024 * 1024,
    10 * 1024 * 1024,
    52428800
  ]
});

function main({ n, size }) {
  createConnection(function(connection) {
    const request = new Request('CREATE TABLE #benchmark ([value] varbinary(max))', (err) => {
      if (err) {
        throw err;
      }

      const buf = Buffer.alloc(size);
      buf.fill('x');

      let i = 0;

      bench.start();

      (function cb() {
        const request = new Request('INSERT INTO #benchmark ([value]) VALUES (@value)', (err) => {
          if (err) {
            throw err;
          }

          if (i++ === n) {
            bench.end(n);

            connection.close();
            const used = process.memoryUsage().rss / 1024 / 1024;
            console.log(`The script uses approximately ${Math.round(used * 100) / 100} MB <-- connection close`);
            return;
          }

          cb();
        });

        request.addParameter('value', TYPES.VarBinary, buf);

        connection.execSql(request);    
      })();
    });

    request.on('done', () => {
        const used = process.memoryUsage().rss / 1024 / 1024;
        console.log(`The script uses approximately ${Math.round(used * 100) / 100} MB <--- request done`);
    })

    connection.execSqlBatch(request);
  });
}