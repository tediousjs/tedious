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
      server: host,
      options: {
        connector: async () => {
          customConnectorCalled = true;
          return net.connect({
            host,
            port,
          });
        },
        port
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
});
