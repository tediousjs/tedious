const fs = require('fs');
const { assert } = require('chai');

const Connection = require('../../src/connection');
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

  beforeEach(function(done) {
    this.timeout(5000);

    connection = new Connection(getConfig());
    connection.on('error', done);
    connection.on('connect', (err) => {
      connection.removeListener('error', done);
      done(err);
    });
  });

  afterEach(function() {
    connection.close();
  });

  it('forwards the error to in-flight requests', function(done) {
    const socketError = new Error('socket error');
    connection.on('error', () => {});

    const request = new Request('WAITFOR 00:00:30', function(err) {
      assert.strictEqual(err, socketError);

      done();
    });

    connection.execSql(request);
    process.nextTick(() => {
      connection.socket.emit('error', socketError);
    });
  });

  it('calls the request completion callback after closing the connection', function(done) {
    const socketError = new Error('socket error');
    connection.on('error', () => {});

    const request = new Request('WAITFOR 00:00:30', function(err) {
      assert.strictEqual(connection.closed, true);

      done();
    });

    connection.execSql(request);
    process.nextTick(() => {
      connection.socket.emit('error', socketError);
    });
  });

  it('calls the request completion callback before emitting the `end` event', function(done) {
    const socketError = new Error('socket error');
    connection.on('error', () => {});

    let endEmitted = false;
    connection.on('end', () => {
      endEmitted = true;
    });

    const request = new Request('WAITFOR 00:00:30', function(err) {
      assert.strictEqual(endEmitted, false);

      process.nextTick(() => {
        assert.strictEqual(endEmitted, true);
        done();
      });
    });

    connection.execSql(request);
    process.nextTick(() => {
      connection.socket.emit('error', socketError);
    });
  });
});
