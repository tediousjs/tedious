const { assert } = require('chai');
const net = require('net');

const { Connection } = require('../../src/tedious');
const IncomingMessageStream = require('../../src/incoming-message-stream');
const OutgoingMessageStream = require('../../src/outgoing-message-stream');
const Debug = require('../../src/debug');
const PreloginPayload = require('../../src/prelogin-payload');
const Message = require('../../src/message');

function buildLoginAckToken() {
  const progname = 'Tedious SQL Server';

  const buffer = Buffer.from([
    0xAD, // Type
    0x00, 0x00, // Length
    0x00, // interface number - SQL
    0x74, 0x00, 0x00, 0x04, // TDS version number
    Buffer.byteLength(progname, 'ucs2') / 2, ...Buffer.from(progname, 'ucs2'), // Progname
    0x00, // major
    0x00, // minor
    0x00, 0x00, // buildNum
  ]);

  buffer.writeUInt16LE(buffer.length, 1);

  return buffer;
}

function buildErrorMessageToken(number, message) {
  const buffer = Buffer.from([
    0xAA, // Type
    0x00, 0x00, // Length
    0x00, 0x00, 0x00, 0x00, // Number
    0x00, // State
    0x00, // Class
    0x00, 0x00, ...Buffer.from(message, 'ucs2'), // Message
    0x00, // Server Name
    0x00, // Proc Name
    0x00, 0x00, 0x00, 0x00, // Line Number
  ]);

  buffer.writeUInt16LE(buffer.length, 1);
  buffer.writeUInt32LE(number, 3);
  buffer.writeUInt16LE(Buffer.byteLength(message, 'ucs2') / 2, 9);

  return buffer;
}

describe('Automatic Connection Retry', function() {
  /**
   * @type {net.Server}
   */
  let server;

  /**
   * @type {net.Socket[]}
   */
  let _connections;

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

  it('should retry the specified number of times on transient errors', function(done) {
    let connectionCount = 0;

    server.on('connection', async (connection) => {
      connectionCount++;

      const debug = new Debug();
      const incomingMessageStream = new IncomingMessageStream(debug);
      const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

      connection.pipe(incomingMessageStream);
      outgoingMessageStream.pipe(connection);

      try {
        const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

        // PRELOGIN
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x12);

          const chunks = [];
          for await (const data of message) {
            chunks.push(data);
          }

          const responsePayload = new PreloginPayload({ encrypt: false });
          const responseMessage = new Message({ type: 0x12 });
          responseMessage.end(responsePayload.data);
          outgoingMessageStream.write(responseMessage);
        }

        // LOGIN7
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x10);

          const chunks = [];
          for await (const data of message) {
            chunks.push(data);
          }

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end(buildErrorMessageToken(4060, 'Failure'));
          outgoingMessageStream.write(responseMessage);
        }

        // No further messages, connection closed on remote
        {
          const { done } = await messageIterator.next();
          assert.isTrue(done);
        }
      } catch (err) {
        console.log(err);
      } finally {
        connection.end();
      }
    });

    const connection = new Connection({
      server: server.address().address,
      options: {
        port: server.address().port,
        encrypt: false,
        maxRetriesOnTransientErrors: 5
      }
    });

    connection.connect((err) => {
      connection.close();

      assert.instanceOf(err, Error);
      assert.strictEqual(6, connectionCount);

      done();
    });
  });

  it('should be able to connect successfully after retrying', function(done) {
    let connectionCount = 0;

    server.on('connection', async (connection) => {
      connectionCount++;

      const debug = new Debug();
      const incomingMessageStream = new IncomingMessageStream(debug);
      const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

      connection.pipe(incomingMessageStream);
      outgoingMessageStream.pipe(connection);

      try {
        const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

        // PRELOGIN
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x12);

          const chunks = [];
          for await (const data of message) {
            chunks.push(data);
          }

          const responsePayload = new PreloginPayload({ encrypt: false });
          const responseMessage = new Message({ type: 0x12 });
          responseMessage.end(responsePayload.data);
          outgoingMessageStream.write(responseMessage);
        }

        if (connectionCount < 3) {
          // LOGIN7
          {
            const { value: message } = await messageIterator.next();
            assert.strictEqual(message.type, 0x10);

            const chunks = [];
            for await (const data of message) {
              chunks.push(data);
            }

            const responseMessage = new Message({ type: 0x04 });
            responseMessage.end(buildErrorMessageToken(4060, 'Failure'));
            outgoingMessageStream.write(responseMessage);
          }
        } else {
          // LOGIN7
          {
            const { value: message } = await messageIterator.next();
            assert.strictEqual(message.type, 0x10);

            const chunks = [];
            for await (const data of message) {
              chunks.push(data);
            }

            const responseMessage = new Message({ type: 0x04 });
            responseMessage.end(buildLoginAckToken());
            outgoingMessageStream.write(responseMessage);
          }

          // SQL Batch (Initial SQL)
          {
            const { value: message } = await messageIterator.next();
            assert.strictEqual(message.type, 0x01);

            const chunks = [];
            for await (const data of message) {
              chunks.push(data);
            }

            const responseMessage = new Message({ type: 0x04 });
            responseMessage.end();
            outgoingMessageStream.write(responseMessage);
          }
        }

        // No further messages, connection closed on remote
        {
          const { done } = await messageIterator.next();
          assert.isTrue(done);
        }
      } catch (err) {
        console.log(err);
      } finally {
        connection.end();
      }
    });

    const connection = new Connection({
      server: server.address().address,
      options: {
        port: server.address().port,
        encrypt: false,
        maxRetriesOnTransientErrors: 5
      }
    });

    connection.connect((err) => {
      connection.close();

      assert.ifError(err);
      assert.strictEqual(3, connectionCount);

      done();
    });
  });

  it('should not retry if the connection timeout fires', function(done) {
    let connectionCount = 0;

    server.on('connection', async (connection) => {
      connectionCount++;

      const debug = new Debug();
      const incomingMessageStream = new IncomingMessageStream(debug);
      const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

      connection.pipe(incomingMessageStream);
      outgoingMessageStream.pipe(connection);

      try {
        const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

        // PRELOGIN
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x12);

          await new Promise((resolve, _reject) => {
            setTimeout(resolve, 500);
          });
        }
      } catch (err) {
        console.log(err);
      } finally {
        connection.end();
      }
    });

    const connection = new Connection({
      server: server.address().address,
      options: {
        port: server.address().port,
        encrypt: false,
        maxRetriesOnTransientErrors: 5,
        connectTimeout: 100,
        connectionRetryInterval: 200,
      }
    });

    connection.connect((err) => {
      connection.close();

      assert.instanceOf(err, Error);
      assert.strictEqual(1, connectionCount);

      done();
    });
  });

  it('should stop retrying if connection timeout fires during retry', function(done) {
    let connectionCount = 0;

    server.on('connection', async (connection) => {
      connectionCount++;

      const debug = new Debug();
      const incomingMessageStream = new IncomingMessageStream(debug);
      const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

      connection.pipe(incomingMessageStream);
      outgoingMessageStream.pipe(connection);

      try {
        const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

        // PRELOGIN
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x12);

          const chunks = [];
          for await (const data of message) {
            chunks.push(data);
          }

          const responsePayload = new PreloginPayload({ encrypt: false });
          const responseMessage = new Message({ type: 0x12 });
          responseMessage.end(responsePayload.data);
          outgoingMessageStream.write(responseMessage);
        }

        // LOGIN7
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x10);

          const chunks = [];
          for await (const data of message) {
            chunks.push(data);
          }

          if (connectionCount < 3) {
            const responseMessage = new Message({ type: 0x04 });
            responseMessage.end(buildErrorMessageToken(4060, 'Failure'));
            outgoingMessageStream.write(responseMessage);
          } else {
            await new Promise((resolve, _reject) => {
              setTimeout(resolve, 500);
            });
          }
        }

        // No further messages, connection closed on remote
        {
          const { done } = await messageIterator.next();
          assert.isTrue(done);
        }
      } catch (err) {
        console.log(err);
      } finally {
        connection.end();
      }
    });

    const connection = new Connection({
      server: server.address().address,
      options: {
        port: server.address().port,
        encrypt: false,
        maxRetriesOnTransientErrors: 5,
        connectTimeout: 200,
        connectionRetryInterval: 50,
      }
    });

    connection.connect((err) => {
      connection.close();

      assert.instanceOf(err, Error);
      assert.strictEqual(3, connectionCount);

      done();
    });
  });
});
