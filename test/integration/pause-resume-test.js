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
  this.connection.on('end', done);
  this.connection.close();
};

function dumpStreamStates(connection) {
  dumpStreamState('Socket', connection.socket);
  dumpStreamState('Packet transform', connection.messageIo.packetStream);
  dumpStreamState('Token transform', connection.tokenStreamParser.parser);
}

function dumpStreamState(name, stream) {
  console.log();
  console.log(name + ' state:');
  const ws = stream._writableState;
  console.log(' ws.length: ' + ws.length);
  console.log(' ws.bufferedRequestCount: ' + ws.bufferedRequestCount);
  console.log(' ws.highWaterMark: ' + ws.highWaterMark);
  const rs = stream._readableState;
  console.log(' rs.length: ' + rs.length);
  console.log(' rs.buffer.length: ' + rs.buffer.length);
  console.log(' rs.highWaterMark: ' + rs.highWaterMark);
  console.log(' rs.flowing: ' + rs.flowing);
}

// This test reads a large number of rows from the database.
// At 1/4 of the rows, Request.pause() is called.
// After a delay, Request.resume() is called.
// This test verifies that:
//  - No 'row' events are received during the pause.
//  - The socket and the two transforms are stopped during the pause.
//  - No large amounts of data are accumulated within the transforms during the pause.
//  - No data is lost.
//  - The request timer does not cancel the query when it takes longer to
//    receive all the rows.
exports.testLargeQuery = function(test) {
  const debugMode = false;
  // total number of rows to read
  const totalRows = 200000;
  // pause delay time in ms
  const delayTime = 1000;
  const connection = this.connection;
  let rowsReceived = 0;
  let paused = false;

  connection.on('error', function(err) {
    test.ifError(err);
  });

  // recursive CTE to generate rows
  const sql = `
    with cte1 as
      (select 1 as i union all select i + 1 from cte1 where i < ${totalRows})
    select i from cte1 option (maxrecursion 0)
  `;
  const request = new Request(sql, onRequestCompletion);
  request.on('row', processRow);
  connection.execSql(request);

  function onRequestCompletion(err) {
    test.ifError(err);
    test.equal(rowsReceived, totalRows, 'Invalid row count.');
    test.done();
  }

  function processRow(columns) {
    if (paused) {
      test.ok(false, 'Row received in paused state.');
    }
    rowsReceived++;

    if (columns[0].value !== rowsReceived) {
      test.ok(false, `Invalid row counter value, value=${columns[0].value}, expected=${rowsReceived}.`);
    }

    if (rowsReceived === Math.round(totalRows / 4)) {
      pause();
    }
  }

  function pause() {
    if (debugMode) {
      dumpStreamStates(connection);
      console.log('Start pause.');
    }
    paused = true;
    request.pause();
    setTimeout(resume, delayTime);
  }

  function resume() {
    if (debugMode) {
      console.log('End pause.');
      dumpStreamStates(connection);
    }
    verifyStreamStatesAfterPause();
    paused = false;
    request.resume();
  }

  function verifyStreamStatesAfterPause() {
    const packetSize = connection.messageIo.packetSize();
    const socketRs = connection.socket._readableState;
    test.ok(!socketRs.flowing, 'Socket is not paused.');

    const minimalSocketFillTestLevel = 0x2000;             // (heuristic value)
    const highWaterReserve = 512;                          // (heuristic value)
    test.ok(socketRs.length >= Math.min(socketRs.highWaterMark - highWaterReserve, minimalSocketFillTestLevel),
      'Socket does not feel backpressure.');
    const packetTransformWs = connection.messageIo.packetStream._writableState;
    const packetTransformRs = connection.messageIo.packetStream._readableState;
    test.ok(!packetTransformRs.flowing,
      'Packet transform is not paused.');
    test.ok(packetTransformWs.length <= packetTransformWs.highWaterMark &&
      packetTransformRs.length <= packetTransformRs.highWaterMark,
      'Packet transform has large amount of data buffered.');
    const tokenTransformWs = connection.tokenStreamParser.parser._writableState;
    const tokenTransformRs = connection.tokenStreamParser.parser._readableState;
    test.ok(!tokenTransformRs.flowing,
      'Token transform is not paused.');
    test.ok(tokenTransformWs.length <= tokenTransformWs.highWaterMark,
      'Token transform input buffer overflow.');
    test.ok(tokenTransformRs.length < packetSize / 3,
      'Token transform output buffer has large amount of data buffered.');
  }
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
        }, 100);
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
  }, 100);
};
