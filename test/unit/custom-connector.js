const net = require('net');
const assert = require('chai').assert;

const { Connection } = require('../../src/tedious');

describe('custom connector', function() {
  let server;

  beforeEach(function(done) {
    server = net.createServer();
    server.listen(0, '127.0.0.1', done);
  });

  afterEach(() => {
    server.close();
  });

  it('connection using a custom connector', function(done) {
    let attemptedConnection = false;
    let customConnectorCalled = false;

    server.on('connection', async (connection) => {
      attemptedConnection = true;
      // no need to test auth/login, just end the connection sooner
      connection.end();
    });

    const host = server.address().address;
    const port = server.address().port;
    const connection = new Connection({
      options: {
        connector: async () => {
          customConnectorCalled = true;
          return net.connect({
            host,
            port,
          });
        },
      },
    });

    connection.on('end', (err) => {
      // validates the connection was stablished using the custom connector
      assert.isOk(attemptedConnection);
      assert.isOk(customConnectorCalled);

      connection.close();
      done();
    });

    connection.on('error', (err) => {
      // Connection lost errors are expected due to ending connection sooner
      if (!/Connection lost/.test(err)) {
        throw err;
      }
    });

    connection.connect();
  });

  it('connection timeout using a custom connector', function(done) {
    const host = server.address().address;
    const port = server.address().port;
    const connection = new Connection({
      options: {
        connectTimeout: 10,
        connector: async () => {
          return net.connect({
            host,
            port,
          });
        },
      },
    });

    // times out since no server response is defined
    connection.connect((err) => {
      assert.strictEqual(
        err.code,
        'ETIMEOUT',
        'should emit timeout error code'
      );
      assert.strictEqual(
        err.message,
        'Failed to connect using custom connector in 10ms',
        'should emit expected custom connector timeout error msg'
      );

      done();
    });
  });

  it('should emit socket error custom connector msg', function(done) {
    const connection = new Connection({
      options: {
        connector: async () => {
          throw new Error('ERR');
        },
      },
    });

    connection.connect((err) => {
      assert.strictEqual(
        err.code,
        'ESOCKET',
        'should emit expected error code'
      );
      assert.strictEqual(
        err.message,
        'Failed to connect using custom connector - ERR',
        'should emit expected custom connector error msg'
      );
      done();
    });
  });

  it('should only accept functions', function(done) {
    assert.throws(() => {
      new Connection({
        options: {
          connector: 'foo',
        },
      });
    }, Error, 'The "config.options.connector" property must be a function.');
    done();
  });

  it('should not allow setting both server and connector options', function(done) {
    assert.throws(() => {
      new Connection({
        server: '0.0.0.0',
        options: {
          connector: async () => {},
        },
      });
    }, Error, 'Server and connector are mutually exclusive, but 0.0.0.0 and a connector function were provided');
    done();
  });

  it('should not allow setting both port and connector options', function(done) {
    assert.throws(() => {
      new Connection({
        options: {
          connector: async () => {},
          port: 8080,
        },
      });
    }, Error, 'Port and connector are mutually exclusive, but 8080 and a connector function were provided');
    done();
  });

  it('should require server config option if custom connector is undefined', function(done) {
    assert.throws(() => {
      new Connection({
        options: { port: 8080 },
      });
    }, TypeError, 'The "config.server" property is required and must be of type string.');
    done();
  });
});
