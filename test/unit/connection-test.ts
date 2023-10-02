import * as net from 'net';
import { Connection, ConnectionError } from '../../src/tedious';
import { assert } from 'chai';
import MessageIO from '../../src/message-io';
import Debug from '../../src/debug';

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
      console.log(err);

      assert.instanceOf(err, Error);

      assert.instanceOf(err?.cause, Error);
      assert.include((err!.cause as Error).message, 'Client network socket disconnected before secure TLS connection was established');

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

describe('Connection error handling', function() {
  describe('handles unexpected network issues', async function() {
    let server: net.Server;
    let _connections: net.Socket[];

    beforeEach(function(done) {
      _connections = [];
      server = net.createServer();
      server.listen(0, '127.0.0.1', done);
    });

    afterEach(function(done) {
      _connections.forEach((connection) => {
        connection.destroy();
      });

      server.close(done);
    });

    it('signals an error', function(done) {
      let connectionCount = 0;

      server.on('connection', async (connection) => {
        connectionCount++;

        const debug = new Debug();

        try {
          // PRELOGIN
          {
            const chunks = [];
            for await (const data of MessageIO.readMessage(connection, debug)) {
              chunks.push(data);
            }

            connection.destroy();
          }
        } catch (err) {
          console.log(err);
        } finally {
          connection.end();
        }
      });

      const connection = new Connection({
        server: (server.address() as net.AddressInfo).address,
        options: {
          port: (server.address() as net.AddressInfo).port,
          encrypt: false,
          maxRetriesOnTransientErrors: 5
        }
      });

      connection.connect((err) => {
        connection.close();

        console.log(err);
        assert.instanceOf(err, Error);
        assert.strictEqual(1, connectionCount);

        done();
      });
    });
  });
});
