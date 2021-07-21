const { assert } = require('chai');
const net = require('net');

const { Connection } = require('../../src/tedious');
const IncomingMessageStream = require('../../src/incoming-message-stream');
const OutgoingMessageStream = require('../../src/outgoing-message-stream');
const Debug = require('../../src/debug');
const PreloginPayload = require('../../src/prelogin-payload');
const Message = require('../../src/message');
const WritableTrackingBuffer = require('../../src/tracking-buffer/writable-tracking-buffer');

function buildRoutingEnvChangeToken(hostname, port) {
  const valueBuffer = new WritableTrackingBuffer(0);
  valueBuffer.writeUInt8(0); // Protocol
  valueBuffer.writeUInt16LE(port); // Port
  valueBuffer.writeUsVarchar(hostname, 'ucs-2');

  const envValueDataBuffer = new WritableTrackingBuffer(0);
  envValueDataBuffer.writeUInt8(20); // Type
  envValueDataBuffer.writeUsVarbyte(valueBuffer.data);
  envValueDataBuffer.writeUsVarbyte(Buffer.alloc(0));

  const envChangeBuffer = new WritableTrackingBuffer(0);
  envChangeBuffer.writeUInt8(0xE3); // TokenType
  envChangeBuffer.writeUsVarbyte(envValueDataBuffer.data); // Length + EnvValueData

  return envChangeBuffer.data;
}

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

describe('Connecting to a server that sends a re-routing information', function() {
  /**
   * @type {net.Server}
   */
  let routingServer;

  beforeEach(function(done) {
    routingServer = net.createServer();
    routingServer.on('error', done);
    routingServer.listen(0, '127.0.0.1', () => {
      routingServer.removeListener('error', done);

      done();
    });
  });

  afterEach(function(done) {
    routingServer.close(done);
  });

  /**
   * @type {net.Server}
   */

  let targetServer;

  beforeEach(function(done) {
    targetServer = net.createServer();
    targetServer.on('error', done);
    targetServer.listen(0, '127.0.0.1', () => {
      targetServer.removeListener('error', done);

      done();
    });
  });

  afterEach(function(done) {
    targetServer.close(done);
  });

  it('connects to the server specified in the re-routing data', async function() {
    routingServer.on('connection', async (connection) => {
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

          const responsePayload = new PreloginPayload({ encrypt: false, version: { major: 0, minor: 0, build: 0, subbuild: 0 } });
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
          responseMessage.write(buildLoginAckToken());
          responseMessage.end(buildRoutingEnvChangeToken(targetServer.address().address, targetServer.address().port));
          outgoingMessageStream.write(responseMessage);
        }

        // No further messages, connection closed on remote
        {
          const { done } = await messageIterator.next();
          assert.isTrue(done);
        }
      } catch (err) {
        process.nextTick(() => {
          throw err;
        });
      } finally {
        connection.end();
      }
    });

    targetServer.on('connection', async (connection) => {
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

          const responsePayload = new PreloginPayload({ encrypt: false, version: { major: 0, minor: 0, build: 0, subbuild: 0 } });
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

        // No further messages, connection closed on remote
        {
          const { done } = await messageIterator.next();
          assert.isTrue(done);
        }
      } catch (err) {
        process.nextTick(() => {
          throw err;
        });
      } finally {
        connection.end();
      }
    });

    const connection = new Connection({
      server: routingServer.address().address,
      options: {
        port: routingServer.address().port,
        encrypt: false
      }
    });

    try {
      await new Promise((resolve, reject) => {
        connection.connect((err) => {
          err ? reject(err) : resolve(err);
        });
      });
    } finally {
      connection.close();
    }
  });

  it('connects to the server specified in the re-routing data, ignoring instance name information', async function() {
    routingServer.on('connection', async (connection) => {
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

          const responsePayload = new PreloginPayload({ encrypt: false, version: { major: 0, minor: 0, build: 0, subbuild: 0 } });
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
          responseMessage.write(buildLoginAckToken());
          responseMessage.end(buildRoutingEnvChangeToken(targetServer.address().address + '\\instanceNameA', targetServer.address().port));
          outgoingMessageStream.write(responseMessage);
        }

        // No further messages, connection closed on remote
        {
          const { done } = await messageIterator.next();
          assert.isTrue(done);
        }
      } catch (err) {
        process.nextTick(() => {
          throw err;
        });
      } finally {
        connection.end();
      }
    });

    targetServer.on('connection', async (connection) => {
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

          const responsePayload = new PreloginPayload({ encrypt: false, version: { major: 0, minor: 0, build: 0, subbuild: 0 } });
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

        // No further messages, connection closed on remote
        {
          const { done } = await messageIterator.next();
          assert.isTrue(done);
        }
      } catch (err) {
        process.nextTick(() => {
          throw err;
        });
      } finally {
        connection.end();
      }
    });

    const connection = new Connection({
      server: routingServer.address().address,
      options: {
        port: routingServer.address().port,
        encrypt: false
      }
    });

    try {
      await new Promise((resolve, reject) => {
        connection.connect((err) => {
          err ? reject(err) : resolve(err);
        });
      });
    } finally {
      connection.close();
    }
  });
});
