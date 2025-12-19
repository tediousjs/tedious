import { assert } from 'chai';
import Connection from '../../src/connection';
import Request from '../../src/request';
import { RequestError } from '../../src/errors';
import { debugOptionsFromEnv } from '../helpers/debug-options-from-env';
import defaultConfig from '../config';

function getConfig() {
  const config = {
    ...defaultConfig,
    options: {
      ...defaultConfig.options,
      debug: debugOptionsFromEnv(),
      tdsVersion: process.env.TEDIOUS_TDS_VERSION,
      // 250 ms timeout until the first response package is received
      requestTimeout: 250
    }
  };

  return config;
}

describe('Pause-Resume Test', function() {
  let connection: Connection;

  beforeEach(function(done) {
    connection = new Connection(getConfig());
    if (process.env.TEDIOUS_DEBUG) {
      connection.on('debug', console.log);
    }
    connection.connect(done);
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

    const request = new Request(sql, () => {
      // error expected when connection closes
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

  it('should test paused request can be cancelled', function(done) {
    connection.on('error', (err) => {
      assert.ifError(err);
    });

    function pauseAndCancelRequest(next: () => void) {
      const sql = `
            with cte1 as
              (select 1 as i union all select i + 1 from cte1 where i < 20000)
            select i from cte1 option (maxrecursion 0)
          `;

      const request = new Request(sql, (error) => {
        assert.instanceOf(error, RequestError);
        assert.strictEqual((error as RequestError).code, 'ECANCEL');

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
    }

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
