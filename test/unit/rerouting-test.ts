import { assert } from 'chai';
import * as net from 'net';
import { Connection, ConnectionError } from '../../src/tedious';
import IncomingMessageStream from '../../src/incoming-message-stream';
import OutgoingMessageStream from '../../src/outgoing-message-stream';
import Debug from '../../src/debug';
import PreloginPayload from '../../src/prelogin-payload';
import Message from '../../src/message';
import WritableTrackingBuffer from '../../src/tracking-buffer/writable-tracking-buffer';

function buildRoutingEnvChangeToken(hostname: string, port: number): Buffer {
  const valueBuffer = new WritableTrackingBuffer(0);
  valueBuffer.writeUInt8(0); // Protocol
  valueBuffer.writeUInt16LE(port); // Port
  valueBuffer.writeUsVarchar(hostname, 'ucs2');

  const envValueDataBuffer = new WritableTrackingBuffer(0);
  envValueDataBuffer.writeUInt8(20); // Type
  envValueDataBuffer.writeUsVarbyte(valueBuffer.data);
  envValueDataBuffer.writeUsVarbyte(Buffer.alloc(0));

  const envChangeBuffer = new WritableTrackingBuffer(0);
  envChangeBuffer.writeUInt8(0xE3); // TokenType
  envChangeBuffer.writeUsVarbyte(envValueDataBuffer.data); // Length + EnvValueData

  return envChangeBuffer.data;
}

function buildLoginAckToken(): Buffer {
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

  buffer.writeUInt16LE(buffer.length - 3, 1);

  return buffer;
}

describe('Connecting to a server that sends a re-routing information', function() {
  let routingServer: net.Server;

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

  let targetServer: net.Server;

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

          const chunks: Buffer[] = [];
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

          const chunks: Buffer[] = [];
          for await (const data of message) {
            chunks.push(data);
          }

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.write(buildLoginAckToken());
          responseMessage.end(buildRoutingEnvChangeToken((targetServer.address() as net.AddressInfo).address, (targetServer.address() as net.AddressInfo).port));
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

          const chunks: Buffer[] = [];
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

          const chunks: Buffer[] = [];
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

          const chunks: Buffer[] = [];
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
      server: (routingServer.address() as net.AddressInfo).address,
      options: {
        port: (routingServer.address() as net.AddressInfo).port,
        encrypt: false
      }
    });

    try {
      await new Promise<void>((resolve, reject) => {
        connection.connect((err) => {
          err ? reject(err) : resolve();
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

          const chunks: Buffer[] = [];
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

          const chunks: Buffer[] = [];
          for await (const data of message) {
            chunks.push(data);
          }

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.write(buildLoginAckToken());
          responseMessage.end(buildRoutingEnvChangeToken((targetServer.address() as net.AddressInfo).address + '\\instanceNameA', (targetServer.address() as net.AddressInfo).port));
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

          const chunks: Buffer[] = [];
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

          const chunks: Buffer[] = [];
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

          const chunks: Buffer[] = [];
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
      server: (routingServer.address() as net.AddressInfo).address,
      options: {
        port: (routingServer.address() as net.AddressInfo).port,
        encrypt: false
      }
    });

    try {
      await new Promise<void>((resolve, reject) => {
        connection.connect((err) => {
          err ? reject(err) : resolve();
        });
      });
    } finally {
      connection.close();
    }
  });

  it('it should throw an error with redirect information when targetserver connection failed', async function() {
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

          const chunks: Buffer[] = [];
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

          const chunks: Buffer[] = [];
          for await (const data of message) {
            chunks.push(data);
          }

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.write(buildLoginAckToken());
          responseMessage.end(buildRoutingEnvChangeToken('test.invalid', (targetServer.address() as net.AddressInfo).port));
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
      server: (routingServer.address() as net.AddressInfo).address,
      options: {
        port: (routingServer.address() as net.AddressInfo).port,
        encrypt: false
      }
    });

    try {
      await new Promise<void>((resolve, reject) => {
        connection.connect((err) => {
          err ? reject(err) : resolve();
        });
      });
    } catch (err) {
      assert.instanceOf(err, ConnectionError);
      const message = `Failed to connect to test.invalid:${(targetServer.address() as net.AddressInfo).port} (redirected from ${(routingServer.address() as net.AddressInfo).address}:${(routingServer.address() as net.AddressInfo).port})`;
      assert.include(err.message, message);
    } finally {
      connection.close();
    }
  });
});
