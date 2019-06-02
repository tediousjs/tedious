const fs = require('fs');
const { assert } = require('chai');

const Connection = require('../../src/connection');
const { ConnectionError } = require('../../src/errors');
const Request = require('../../src/request');

function getConfig() {
  const config = JSON.parse(
    fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')
  ).config;

  config.options.debug = {
    packet: true,
    data: true,
    payload: true,
    token: false,
    log: true
  };

  config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;

  return config;
}

describe('A `error` on the network socket', function() {
  let connection;

  beforeEach(() => {
    connection = new Connection(getConfig());
  });

  afterEach(() => {
    connection.close();
  });

  it('wraps and forwards the error to in-flight requests', function(done) {
    const socketError = new Error('socket error');

    connection.on('error', () => {});
    connection.on('connect', (err) => {
      if (err) {
        return done(err);
      }

      const request = new Request('WAITFOR 00:00:30', function(err) {
        assert.instanceOf(err, ConnectionError);
        assert.strictEqual(err.message, 'Connection lost - socket error');

        done();
      });

      connection.execSql(request);
      process.nextTick(() => {
        connection.socket.emit('error', socketError);
      });
    });
  });

  it('calls the request completion callback after closing the connection', function(done) {
    const socketError = new Error('socket error');

    connection.on('error', () => {});
    connection.on('connect', (err) => {
      if (err) {
        return done(err);
      }

      const request = new Request('WAITFOR 00:00:30', function(err) {
        assert.strictEqual(connection.closed, true);

        done();
      });

      connection.execSql(request);
      process.nextTick(() => {
        connection.socket.emit('error', socketError);
      });
    });
  });

  it('calls the request completion callback before emitting the `end` event', function(done) {
    const socketError = new Error('socket error');

    connection.on('error', () => {});

    let endEmitted = false;
    let callbackCalled = false;

    connection.on('end', () => {
      assert.strictEqual(callbackCalled, true);

      endEmitted = true;

      done();
    });

    connection.on('connect', (err) => {
      if (err) {
        return done(err);
      }

      const request = new Request('WAITFOR 00:00:30', function(err) {
        assert.strictEqual(endEmitted, false);

        callbackCalled = true;
      });

      connection.execSql(request);
      process.nextTick(() => {
        connection.socket.emit('error', socketError);
      });
    });
  });
});
