import { assert } from 'chai';
import * as net from 'net';
import { Connection, ConnectionError, Request, RequestError } from '../../src/tedious';
import IncomingMessageStream from '../../src/incoming-message-stream';
import OutgoingMessageStream from '../../src/outgoing-message-stream';
import Debug from '../../src/debug';
import PreloginPayload from '../../src/prelogin-payload';
import Message from '../../src/message';

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

describe('Closing a connection while connecting', function() {
  let server: net.Server;
  let _connections: net.Socket[];

  beforeEach(function(done) {
    _connections = [];
    server = net.createServer((connection) => {
      _connections.push(connection);
    });
    server.listen(0, '127.0.0.1', done);
  });

  afterEach(function(done) {
    _connections.forEach((connection) => {
      connection.destroy();
    });

    server.close(done);
  });

  it('should abort the connection process when `close` is called immediately after `connect`', function(done) {
    // A server that responds to the full login sequence. Without aborting
    // the connection process, the connection will happily continue to log
    // in and end up in the `LoggedIn` state, despite being closed.
    server.on('connection', async (connection) => {
      const debug = new Debug();
      const incomingMessageStream = new IncomingMessageStream(debug);
      const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

      connection.pipe(incomingMessageStream);
      outgoingMessageStream.pipe(connection);

      try {
        const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

        // PRELOGIN
        {
          const { value: message, done } = await messageIterator.next();
          if (done) {
            return;
          }
          assert.strictEqual(message.type, 0x12);

          const chunks: Buffer[] = [];
          for await (const data of message) {
            chunks.push(data);
          }

          const responsePayload = new PreloginPayload({ encrypt: false, version: { major: 1, minor: 2, build: 3, subbuild: 0 } });
          const responseMessage = new Message({ type: 0x12 });
          responseMessage.end(responsePayload.data);
          outgoingMessageStream.write(responseMessage);
        }

        // LOGIN7
        {
          const { value: message, done } = await messageIterator.next();
          if (done) {
            return;
          }
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
          const { value: message, done } = await messageIterator.next();
          if (done) {
            return;
          }
          assert.strictEqual(message.type, 0x01);

          const chunks: Buffer[] = [];
          for await (const data of message) {
            chunks.push(data);
          }

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end();
          outgoingMessageStream.write(responseMessage);
        }
      } catch (err) {
        console.log(err);
      }
    });

    const connection = new Connection({
      server: (server.address() as net.AddressInfo).address,
      options: {
        port: (server.address() as net.AddressInfo).port,
        encrypt: false
      }
    });

    let endCount = 0;
    connection.on('end', () => {
      endCount += 1;
    });

    connection.connect((err) => {
      assert.instanceOf(err, ConnectionError);
      assert.strictEqual(err.code, 'ECLOSE');
      assert.strictEqual(err.message, 'Connection closed before the connection was established.');

      assert.strictEqual(endCount, 1);

      // Ensure no additional `end` event is emitted afterwards.
      setImmediate(() => {
        assert.strictEqual(endCount, 1);

        done();
      });
    });

    connection.close();
  });

  it('should abort the connection process when `close` is called while the connection is being established', function(done) {
    // A server that accepts connections but never responds.
    server.on('connection', () => {
      setImmediate(() => {
        connection.close();
      });
    });

    const connection = new Connection({
      server: (server.address() as net.AddressInfo).address,
      options: {
        port: (server.address() as net.AddressInfo).port,
        encrypt: false,
        connectTimeout: 1000
      }
    });

    let endCount = 0;
    connection.on('end', () => {
      endCount += 1;
    });

    connection.connect((err) => {
      assert.instanceOf(err, ConnectionError);
      assert.strictEqual(err.code, 'ECLOSE');

      assert.strictEqual(endCount, 1);

      // Ensure no additional `end` event is emitted afterwards.
      setImmediate(() => {
        assert.strictEqual(endCount, 1);

        done();
      });
    });
  });
});

describe('Closing a connection with an active request', function() {
  let server: net.Server;
  let _connections: net.Socket[];

  beforeEach(function(done) {
    _connections = [];
    server = net.createServer((connection) => {
      _connections.push(connection);
    });
    server.listen(0, '127.0.0.1', done);
  });

  afterEach(function(done) {
    _connections.forEach((connection) => {
      connection.destroy();
    });

    server.close(done);
  });

  it('should complete the request with `ECLOSE` exactly once, even when the request callback calls `close` again', function(done) {
    // A server that responds to the full login sequence, but not to any
    // requests made afterwards.
    server.on('connection', async (connection) => {
      const debug = new Debug();
      const incomingMessageStream = new IncomingMessageStream(debug);
      const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

      connection.pipe(incomingMessageStream);
      outgoingMessageStream.pipe(connection);

      try {
        const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

        // PRELOGIN
        {
          const { value: message, done } = await messageIterator.next();
          if (done) {
            return;
          }
          assert.strictEqual(message.type, 0x12);

          const chunks: Buffer[] = [];
          for await (const data of message) {
            chunks.push(data);
          }

          const responsePayload = new PreloginPayload({ encrypt: false, version: { major: 1, minor: 2, build: 3, subbuild: 0 } });
          const responseMessage = new Message({ type: 0x12 });
          responseMessage.end(responsePayload.data);
          outgoingMessageStream.write(responseMessage);
        }

        // LOGIN7
        {
          const { value: message, done } = await messageIterator.next();
          if (done) {
            return;
          }
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
          const { value: message, done } = await messageIterator.next();
          if (done) {
            return;
          }
          assert.strictEqual(message.type, 0x01);

          const chunks: Buffer[] = [];
          for await (const data of message) {
            chunks.push(data);
          }

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end();
          outgoingMessageStream.write(responseMessage);
        }
      } catch (err) {
        console.log(err);
      }
    });

    const connection = new Connection({
      server: (server.address() as net.AddressInfo).address,
      options: {
        port: (server.address() as net.AddressInfo).port,
        encrypt: false
      }
    });

    let endCount = 0;
    connection.on('end', () => {
      endCount += 1;
    });

    connection.connect((err) => {
      assert.isUndefined(err);

      let callCount = 0;
      const request = new Request('select 1', (err) => {
        callCount += 1;

        assert.instanceOf(err, RequestError);
        assert.strictEqual((err as RequestError).code, 'ECLOSE');

        // Calling `close` from a request callback that is invoked as part
        // of the connection cleanup must not re-enter the cleanup logic
        // and complete the request a second time.
        connection.close();
      });

      connection.execSqlBatch(request);
      connection.close();

      setImmediate(() => {
        assert.strictEqual(callCount, 1);
        assert.strictEqual(endCount, 1);

        done();
      });
    });
  });
});
