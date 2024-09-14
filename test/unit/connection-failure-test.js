const { assert } = require('chai');
const net = require('net');

const { Connection, ConnectionError } = require('../../src/tedious');
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

  buffer.writeUInt16LE(buffer.length - 3, 1);

  return buffer;
}

describe('Connection failure handling', function() {
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

  it('should fail correctly when the connection is aborted after the prelogin message is sent', function(done) {
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
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x12);

          setImmediate(() => {
            connection.destroy();
          });
        }
      } catch (err) {
        console.log(err);
      }
    });

    const connection = new Connection({
      server: server.address().address,
      options: {
        port: server.address().port,
        encrypt: false
      }
    });

    connection.connect((err) => {
      connection.close();

      assert.instanceOf(err, ConnectionError);
      assert.strictEqual('Connection lost - socket hang up', err.message);

      assert.instanceOf(err.cause, Error);
      assert.strictEqual('socket hang up', err.cause.message);

      done();
    });
  });

  it('should fail correctly when the connection is aborted after the prelogin response is received', function(done) {
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
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x12);

          const chunks = [];
          for await (const data of message) {
            chunks.push(data);
          }

          const responsePayload = new PreloginPayload({ encrypt: false, version: { major: 1, minor: 2, build: 3, subbuild: 0 } });
          const responseMessage = new Message({ type: 0x12 });
          responseMessage.end(responsePayload.data);
          outgoingMessageStream.write(responseMessage);
        }

        setImmediate(() => {
          connection.destroy();
        });
      } catch (err) {
        console.log(err);
      }
    });

    const connection = new Connection({
      server: server.address().address,
      options: {
        port: server.address().port,
        encrypt: false
      }
    });

    connection.connect((err) => {
      connection.close();

      assert.instanceOf(err, ConnectionError);
      assert.strictEqual('Connection lost - socket hang up', err.message);

      assert.instanceOf(err.cause, Error);
      assert.strictEqual('socket hang up', err.cause.message);

      done();
    });
  });

  it('should fail correctly when the connection is aborted after the Login7 message is sent', function(done) {
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
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x12);

          const chunks = [];
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
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x10);

          setImmediate(() => {
            connection.destroy();
          });
        }
      } catch (err) {
        console.log(err);
      }
    });

    const connection = new Connection({
      server: server.address().address,
      options: {
        port: server.address().port,
        encrypt: false
      }
    });

    connection.connect((err) => {
      connection.close();

      assert.instanceOf(err, ConnectionError);
      assert.strictEqual('Connection lost - socket hang up', err.message);

      assert.instanceOf(err.cause, Error);
      assert.strictEqual('socket hang up', err.cause.message);

      done();
    });
  });

  it('should fail correctly when the connection is aborted after the Login7 response is received', function(done) {
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
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x12);

          const chunks = [];
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

        setImmediate(() => {
          connection.destroy();
        });
      } catch (err) {
        console.log(err);
      }
    });

    const connection = new Connection({
      server: server.address().address,
      options: {
        port: server.address().port,
        encrypt: false
      }
    });

    connection.connect((err) => {
      connection.close();

      console.log(err);

      assert.instanceOf(err, ConnectionError);
      assert.strictEqual('Connection lost - socket hang up', err.message);

      assert.instanceOf(err.cause, Error);
      assert.strictEqual('socket hang up', err.cause.message);

      done();
    });
  });

  it('should fail correctly when the connection is aborted after the initial SQL message is sent', function(done) {
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
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x12);

          const chunks = [];
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

          setImmediate(() => {
            connection.destroy();
          });
        }
      } catch (err) {
        console.log(err);
      }
    });

    const connection = new Connection({
      server: server.address().address,
      options: {
        port: server.address().port,
        encrypt: false
      }
    });

    connection.connect((err) => {
      connection.close();

      assert.instanceOf(err, ConnectionError);
      assert.strictEqual('Connection lost - socket hang up', err.message);

      assert.instanceOf(err.cause, Error);
      assert.strictEqual('socket hang up', err.cause.message);

      done();
    });
  });

  it('should fail correctly when the connection is aborted after the initial SQL response is received', function(done) {
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
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x12);

          const chunks = [];
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

        setImmediate(() => {
          connection.destroy();
        });
      } catch (err) {
        console.log(err);
      }
    });

    const connection = new Connection({
      server: server.address().address,
      options: {
        port: server.address().port,
        encrypt: false
      }
    });

    connection.connect((err) => {
      assert.isUndefined(err);

      connection.on('error', (err) => {
        connection.close();

        assert.instanceOf(err, ConnectionError);
        assert.strictEqual('Connection lost - socket hang up', err.message);

        assert.instanceOf(err.cause, Error);
        assert.strictEqual('socket hang up', err.cause.message);

        done();
      });
    });
  });
});
