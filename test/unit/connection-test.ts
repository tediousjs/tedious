import * as net from 'net';
import { Connection, ConnectionError } from '../../src/tedious';
import { assert } from 'chai';

describe('Using `strict` encryption', function() {
  let server: net.Server;

  beforeEach(function(done) {
    server = net.createServer();
    server.listen(0, '127.0.0.1', done);
  });

  afterEach(function(done) {
    server.close(done);
  });

  it('does not throw an unhandled exception if the tls handshake fails', function(done) {
    server.on('connection', (connection) => {
      console.log('incoming connection');

      connection.on('data', () => {
        // Ignore all incoming data
      });

      setTimeout(() => {
        connection.end();
      }, 50);
    });

    const connection = new Connection({
      server: (server.address() as net.AddressInfo).address,
      options: {
        port: (server.address() as net.AddressInfo).port,
        encrypt: 'strict'
      }
    });

    connection.connect((err) => {
      assert.instanceOf(err, Error);
      assert.include(err!.message, 'Client network socket disconnected before secure TLS connection was established');

      done();
    });
  });

  it('handles connection timeout when performing tls handshake', function(done) {
    server.on('connection', (connection) => {
      setTimeout(() => {
        connection.destroy();
      }, 4000);
    });

    const addressInfo = server.address() as net.AddressInfo;

    const connection = new Connection({
      server: addressInfo?.address,
      options: {
        port: addressInfo?.port,
        encrypt: 'strict',
        connectTimeout: 3000
      }
    });

    connection.connect((err) => {
      assert.instanceOf(err, ConnectionError);

      const message = `Failed to connect to ${addressInfo?.address}:${addressInfo?.port} in 3000ms`;
      assert.equal(err!.message, message);

      connection.close();
    });

    connection.on('end', () => {
      done();
    });
  });
});
