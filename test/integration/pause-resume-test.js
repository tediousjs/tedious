// This module contains tests cases for the Request.pause()/resume() methods.

'use strict';

const Connection = require('../../src/connection');
const Request = require('../../src/request');
const fs = require('fs');
const semver = require('semver');

function getConfig() {
  const config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection.json', 'utf8')).config;
  config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;
  config.options.requestTimeout = 250;                     // 250 ms timeout until the first response package is received
  return config;
}

exports.setUp = function(setUpDone) {
  const connection = new Connection(getConfig());
  connection.on('connect', (err) => {
    if (err) {
      setUpDone(err);
      return;
    }
    this.connection = connection;
    setUpDone();
  });
  connection.on('end', () => {
    this.connection = undefined;
  });
};

exports.tearDown = function(tearDownDone) {
  const connection = this.connection;
  if (!connection) {
    tearDownDone();
    return;
  }
  connection.on('end', function() {
    tearDownDone();
  });
  connection.close();
};

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
  const totalRows = 200000;                                // total number of rows to read
  const delayTime = 500;                                   // pause delay time in ms
  const connection = this.connection;
  let request;
  let rowsReceived = 0;
  let failed = false;                                      // used to suppress further error messages
  let paused = false;

  connection.on('error', function(err) {
    test.ifError(err);
  });
  openRequest();

  function openRequest() {
    const sql =                                            // recursive CTE to generate rows
      'with cte1 as ' +
        '(select 1 as i union all select i + 1 from cte1 where i < ' + totalRows + ') ' +
      'select i from cte1 option (maxrecursion 0)';
    request = new Request(sql, onRequestCompletion);
    request.on('row', processRow);
    connection.execSql(request);
  }

  function onRequestCompletion(err) {
    test.ifError(err);
    test.equal(rowsReceived, totalRows, 'Invalid row count.');
    test.done();
  }

  function processRow(columns) {
    if (paused) {
      fail('Row received in paused state.');
    }
    rowsReceived++;
    if (columns[0].value !== rowsReceived) {
      fail('Invalid row counter value, value=' + columns[0].value + ', expected=' + rowsReceived + '.');
      return;
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
    if (semver.gte(process.version, '0.12.18')) {
      test.ok(!socketRs.flowing,
        'Socket is not paused.');
    }
    const minimalSocketFillTestLevel = 0x4000;             // (heuristic value)
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

  function fail(msg) {
    if (failed) {
      return;
    }
    failed = true;
    test.ok(false, msg);
    connection.close();
  }
};

// This test reads only a few rows and makes a short pause after each row.
// This test verifies that:
//  - Pause/resume works correctly when applied after the last packet of a TDS
//    message has already been dispatched by MessageIO.ReadablePacketStream.
//    This is the case when EOM / packet.isLast() has already been detected
//    at the time when Request.pause() is called.
//    The 'message' event emitted by MessageIO has to be channeled through
//    the token parser transform.
//  - No more 'row' events are emitted after a paused request has been canceled.
//  - The internal data flow is resumed after a paused request has been canceled.
//  - A request can be paused before Connection.execSql() is called.
exports.testTransitions = function(test) {
  const totalRequests = 4;
  const rowsPerRequest = 4;
  const delayTime = 100;                                   // pause delay time in ms
  const requestToCancel = 2;                               // 1-based position of request to be canceled
  const rowToCancel = 2;                                   // 1-based position of row at which connection.cancel() will be called
  const requestToStartPaused = 4;                          // 1-based position of request to start paused
  const connection = this.connection;
  let request;
  let requestCount = 0;
  let rowCount;
  let paused = false;
  let canceled = false;

  connection.on('error', function(err) {
    test.ifError(err);
  });
  openRequest();

  function openRequest() {
    let sql = 'select 1';
    for (let i = 2; i <= rowsPerRequest; i++) {
      sql = sql + ' union all select ' + i;
    }
    request = new Request(sql, onRequestCompletion);
    request.on('row', processRow);
    rowCount = 0;
    paused = false;
    canceled = false;
    if (requestCount === requestToStartPaused - 1) {
      pause();
    }
    connection.execSql(request);
  }

  function onRequestCompletion(err) {
    requestCount++;
    if (requestCount === requestToCancel) {
      test.ok(err && err.code === 'ECANCEL');
      test.equal(rowCount, rowToCancel);
    } else {
      test.ifError(err);
      test.equal(rowCount, rowsPerRequest);
    }
    if (requestCount < totalRequests) {
      openRequest();
    } else {
      test.done();
    }
  }

  function processRow(columns) {
    test.ok(!canceled, 'Row received in canceled state, requestCount=' + requestCount + ' rowCount=' + rowCount);
    test.ok(!paused, 'Row received in paused state, requestCount=' + requestCount + ' rowCount=' + rowCount);
    rowCount++;
    test.equal(columns[0].value, rowCount);
    pause();
  }

  function pause() {
    paused = true;
    request.pause();
    setTimeout(afterDelay, delayTime);
  }

  function afterDelay() {
    if (requestCount === requestToCancel - 1 && rowCount === rowToCancel) {
      canceled = true;
      connection.cancel();
    } else {
      paused = false;
      request.resume();
    }
  }
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
