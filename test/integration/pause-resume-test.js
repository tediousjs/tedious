const fs = require('fs');
const Connection = require('../../src/connection');
const Request = require('../../src/request');
const assert = require('chai').assert;

function getConfig() {
  const config = JSON.parse(fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')).config;
  config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;
  // 250 ms timeout until the first response package is received
  config.options.requestTimeout = 250;
  return config;
}

describe('Pause-Resume Test', function() {
  this.timeout(10000);
  let connection;

  beforeEach(function(done) {
    connection = new Connection(getConfig());
    connection.on('connect', done);
  });

  afterEach(function(done) {
    if (connection.closed) {
      done();
    } else {
      connection.on('end', done);
      connection.close();
    }
  });

  it('should test paused request does not emit rwos after connection close', function(done) {
    const sql = `
        with cte1 as
          (select 1 as i union all select i + 1 from cte1 where i < 20000)
        select i from cte1 option (maxrecursion 0)
      `;

    const request = new Request(sql, (error) => {
      assert.ok(error);
    });

    request.on('row', (columns) => {
      if (columns[0].value === 1000) {
        request.pause();

        setTimeout(() => {
          connection.on('end', () => {
            process.nextTick(() => {
              done();
            });
          });
          connection.close();
        }, 200);
      }
    });

    connection.execSql(request);
  });

  it('should test paused request can be resumed', function(done) {
    const sql = `
          with cte1 as
            (select 1 as i union all select i + 1 from cte1 where i < 20000)
          select i from cte1 option (maxrecursion 0)
        `;

    let rowsReceived = 0;
    let paused = false;

    const request = new Request(sql, (error) => {
      assert.ifError(error);

      assert.strictEqual(rowsReceived, 20000);

      done();
    });

    request.on('row', (columns) => {
      assert.ok(!paused);

      rowsReceived++;

      assert.strictEqual(columns[0].value, rowsReceived);

      if (columns[0].value === 1000) {
        paused = true;
        request.pause();

        setTimeout(() => {
          paused = false;
          request.resume();
        }, 1000);
      }
    });

    connection.execSql(request);
  });

  it('should test pausing request pauses transforms', function(done) {
    const sql = `
          with cte1 as
            (select 1 as i union all select i + 1 from cte1 where i < 20000)
          select i from cte1 option (maxrecursion 0)
        `;

    const request = new Request(sql, (error) => {
      assert.ifError(error);

      done();
    });

    request.on('row', (columns) => {
      if (columns[0].value === 1000) {
        request.pause();

        setTimeout(() => {
          assert.ok(connection.messageIo.incomingMessageStream.isPaused());
          assert.ok(connection.tokenStreamParser.parser.isPaused());

          request.resume();
        }, 3000);
      }
    });

    connection.execSql(request);
  });

  it('should test paused request can be cancelled', function(done) {
    connection.on('error', (err) => {
      assert.ifError(err);
    });

    const pauseAndCancelRequest = (next) => {
      const sql = `
            with cte1 as
              (select 1 as i union all select i + 1 from cte1 where i < 20000)
            select i from cte1 option (maxrecursion 0)
          `;

      const request = new Request(sql, (error) => {
        assert.ok(error);
        assert.strictEqual(error.code, 'ECANCEL');

        next();
      });

      request.on('row', (columns) => {
        if (columns[0].value === 1000) {
          request.pause();

          setTimeout(() => {
            connection.cancel();
          }, 200);
        } else if (columns[0].value > 1000) {
          assert.ok(false, 'Received rows after pause');
        }
      });

      connection.execSql(request);
    };

    pauseAndCancelRequest(() => {
      const request = new Request('SELECT 1', (error) => {
        assert.ifError(error);
        done();
      });

      request.on('row', (columns) => {
        assert.strictEqual(columns[0].value, 1);
      });

      connection.execSql(request);
    });
  });

  it('should test immediately paused request does not emit rows until resumed', function(done) {
    connection.on('error', (err) => {
      assert.ifError(err);
    });

    const request = new Request('SELECT 1', (error) => {
      assert.ifError(error);
      done();
    });

    let paused = true;
    request.pause();

    request.on('row', (columns) => {
      assert.ok(!paused);

      assert.strictEqual(columns[0].value, 1);
    });

    connection.execSql(request);

    setTimeout(() => {
      paused = false;
      request.resume();
    }, 200);
  });
});
