const fs = require('fs');

const Connection = require('../../src/connection');
const Request = require('../../src/request');

function getConfig() {
  const config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config;
  config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;
  // 250 ms timeout until the first response package is received
  config.options.requestTimeout = 250;
  return config;
}

exports.setUp = function(done) {
  this.connection = new Connection(getConfig());
  this.connection.on('connect', done);
};

exports.tearDown = function(done) {
  if (this.connection.closed) {
    done();
  } else {
    this.connection.on('end', done);
    this.connection.close();
  }
};

exports.testPausedRequestDoesNotEmitRowsAfterConnectionClose = function(test) {
  const sql = `
    with cte1 as
      (select 1 as i union all select i + 1 from cte1 where i < 20000)
    select i from cte1 option (maxrecursion 0)
  `;

  const request = new Request(sql, (error) => {
    test.ok(error);
  });

  request.on('row', (columns) => {
    if (columns[0].value == 1000) {
      request.pause();

      setTimeout(() => {
        this.connection.on('end', () => {
          process.nextTick(() => {
            test.done();
          });
        });
        this.connection.close();
      }, 200);
    }
  });

  this.connection.execSql(request);
};

exports.testPausedRequestCanBeResumed = function(test) {
  const sql = `
    with cte1 as
      (select 1 as i union all select i + 1 from cte1 where i < 20000)
    select i from cte1 option (maxrecursion 0)
  `;

  let rowsReceived = 0;
  let paused = false;

  const request = new Request(sql, (error) => {
    test.ifError(error);

    test.strictEqual(rowsReceived, 20000);

    test.done();
  });

  request.on('row', (columns) => {
    test.ok(!paused);

    rowsReceived++;

    test.strictEqual(columns[0].value, rowsReceived);

    if (columns[0].value == 1000) {
      paused = true;
      request.pause();

      setTimeout(() => {
        paused = false;
        request.resume();
      }, 1000);
    }
  });

  this.connection.execSql(request);
};

exports.testPausingRequestPausesTransforms = function(test) {
  const sql = `
    with cte1 as
      (select 1 as i union all select i + 1 from cte1 where i < 20000)
    select i from cte1 option (maxrecursion 0)
  `;

  const request = new Request(sql, (error) => {
    test.ifError(error);

    test.done();
  });

  request.on('row', (columns) => {
    if (columns[0].value == 1000) {
      request.pause();

      setTimeout(() => {
        test.ok(this.connection.messageIo.packetStream.isPaused());
        test.ok(this.connection.tokenStreamParser.parser.isPaused());

        request.resume();
      }, 3000);
    }
  });

  this.connection.execSql(request);
};

exports.testPausedRequestCanBeCancelled = function(test) {
  this.connection.on('error', (err) => {
    test.ifError(err);
  });

  const pauseAndCancelRequest = (next) => {
    const sql = `
      with cte1 as
        (select 1 as i union all select i + 1 from cte1 where i < 20000)
      select i from cte1 option (maxrecursion 0)
    `;

    const request = new Request(sql, (error) => {
      test.ok(error);
      test.strictEqual(error.code, 'ECANCEL');

      next();
    });

    request.on('row', (columns) => {
      if (columns[0].value == 1000) {
        request.pause();

        setTimeout(() => {
          this.connection.cancel();
        }, 200);
      } else if (columns[0].value > 1000) {
        test.ok(false, 'Received rows after pause');
      }
    });

    this.connection.execSql(request);
  };

  pauseAndCancelRequest(() => {
    const request = new Request('SELECT 1', (error) => {
      test.ifError(error);
      test.done();
    });

    request.on('row', (columns) => {
      test.strictEqual(columns[0].value, 1);
    });

    this.connection.execSql(request);
  });
};

exports.testImmediatelyPausedRequestDoesNotEmitRowsUntilResumed = function(test) {
  this.connection.on('error', (err) => {
    test.ifError(err);
  });

  const request = new Request('SELECT 1', (error) => {
    test.ifError(error);
    test.done();
  });

  let paused = true;
  request.pause();

  request.on('row', (columns) => {
    test.ok(!paused);

    test.strictEqual(columns[0].value, 1);
  });

  this.connection.execSql(request);

  setTimeout(() => {
    paused = false;
    request.resume();
  }, 200);
};
