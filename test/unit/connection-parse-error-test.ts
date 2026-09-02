import { assert } from 'chai';
import * as net from 'net';
import { Connection, Request } from '../../src/tedious';
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

/**
 * Builds a final `DONE` token.
 */
function buildDoneToken(): Buffer {
  const buffer = Buffer.alloc(13);

  let offset = 0;
  offset = buffer.writeUInt8(0xFD, offset); // DONE
  offset = buffer.writeUInt16LE(0x0000, offset); // status = DONE_FINAL
  offset = buffer.writeUInt16LE(0x0000, offset); // curCmd
  buffer.writeBigUInt64LE(0n, offset); // rowCount

  return buffer;
}

/**
 * Builds an `INFO` token, as a server sends for e.g. a `PRINT` statement.
 */
function buildInfoToken(): Buffer {
  const message = 'hello';
  const messageData = Buffer.from(message, 'ucs2');

  const data = Buffer.alloc(4 + 1 + 1 + 2 + messageData.length + 1 + 1 + 4);

  let offset = 0;
  offset = data.writeUInt32LE(50000, offset); // number
  offset = data.writeUInt8(1, offset); // state
  offset = data.writeUInt8(0, offset); // class - informational
  offset = data.writeUInt16LE(message.length, offset); // message length (in characters)
  offset += messageData.copy(data, offset); // message
  offset = data.writeUInt8(0, offset); // server name length
  offset = data.writeUInt8(0, offset); // proc name length
  data.writeUInt32LE(0, offset); // line number (TDS 7.2+)

  const buffer = Buffer.alloc(3 + data.length);
  buffer.writeUInt8(0xAB, 0); // INFO
  buffer.writeUInt16LE(data.length, 1); // token length
  data.copy(buffer, 3);

  return buffer;
}

/**
 * Reads and discards all data of the given message.
 */
async function drainMessage(message: Message): Promise<void> {
  const iterator = message[Symbol.asyncIterator]();
  while (!(await iterator.next()).done) {
    // Discard the data.
  }
}

interface ScriptedExchange {
  messageIterator: AsyncIterator<Message>;
  outgoingMessageStream: OutgoingMessageStream;
}

/**
 * Serves the prelogin / login / initial SQL exchange, then hands control to
 * `onRequest` once the first request message (the one under test) has been
 * read and drained.
 */
function serveUntilRequest(server: net.Server, onRequest: (exchange: ScriptedExchange) => Promise<void> | void, onError: (err: Error) => void) {
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

        await drainMessage(message);

        const responsePayload = new PreloginPayload({ encrypt: false, version: { major: 1, minor: 2, build: 3, subbuild: 0 } });
        const responseMessage = new Message({ type: 0x12 });
        responseMessage.end(responsePayload.data);
        outgoingMessageStream.write(responseMessage);
      }

      // LOGIN7
      {
        const { value: message } = await messageIterator.next();
        assert.strictEqual(message.type, 0x10);

        await drainMessage(message);

        const responseMessage = new Message({ type: 0x04 });
        responseMessage.end(Buffer.concat([buildLoginAckToken(), buildDoneToken()]));
        outgoingMessageStream.write(responseMessage);
      }

      // SQL Batch (Initial SQL)
      {
        const { value: message } = await messageIterator.next();
        assert.strictEqual(message.type, 0x01);

        await drainMessage(message);

        const responseMessage = new Message({ type: 0x04 });
        responseMessage.end();
        outgoingMessageStream.write(responseMessage);
      }

      // SQL Batch (the request under test)
      {
        const { value: message } = await messageIterator.next();
        assert.strictEqual(message.type, 0x01);

        await drainMessage(message);

        await onRequest({ messageIterator, outgoingMessageStream });
      }
    } catch (err: any) {
      onError(err);
    }
  });
}

/**
 * Responds to the request under test with a message whose payload ends in
 * `0x00`, which is not a valid token type - parsing it throws inside the
 * token parser.
 */
function respondWithInvalidToken({ outgoingMessageStream }: ScriptedExchange, prefix: Buffer = Buffer.alloc(0)) {
  const responseMessage = new Message({ type: 0x04 });
  responseMessage.end(Buffer.concat([prefix, Buffer.from([0x00])]));
  outgoingMessageStream.write(responseMessage);
}

describe('A token parse failure in a response', function() {
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

  function createConnection(options: Record<string, unknown> = {}) {
    return new Connection({
      server: (server.address() as net.AddressInfo).address,
      options: {
        port: (server.address() as net.AddressInfo).port,
        encrypt: false,
        ...options
      }
    });
  }

  it('fails the request instead of raising an unhandled stream error', function(done) {
    serveUntilRequest(server, (exchange) => {
      respondWithInvalidToken(exchange);
    }, done);

    const connection = createConnection();

    connection.on('error', () => {
      // The parse failure is also surfaced as a connection error.
    });

    connection.connect((err) => {
      assert.isUndefined(err);

      const request = new Request('select 1', (err) => {
        assert.instanceOf(err, Error);
        assert.match((err as Error).message, /Unknown type/);

        connection.close();
        done();
      });

      connection.execSqlBatch(request);
    });
  });

  it('stays silent when the connection was closed from a token handler while malformed bytes were still buffered', function(done) {
    // A valid `INFO` token followed by the invalid one: the user closes the
    // connection from the `infoMessage` handler, so the parse failure lands
    // after the connection has already reached `Final`.
    serveUntilRequest(server, (exchange) => {
      respondWithInvalidToken(exchange, buildInfoToken());
    }, done);

    const connection = createConnection();

    const connectionErrors: Error[] = [];
    connection.on('error', (err) => {
      connectionErrors.push(err);
    });

    connection.on('infoMessage', () => {
      connection.close();
    });

    connection.connect((err) => {
      assert.isUndefined(err);

      let callbackCount = 0;
      const request = new Request('select 1', (err) => {
        callbackCount += 1;
        assert.instanceOf(err, Error);
        assert.strictEqual((err as any).code, 'ECLOSE');

        // Give the buffered parse failure time to be processed.
        setTimeout(() => {
          assert.strictEqual(callbackCount, 1);
          assert.deepEqual(connectionErrors, [], 'nothing should be emitted after close()');
          done();
        }, 100);
      });

      connection.execSqlBatch(request);
    });
  });

  it('leaves the failed request without listeners, so a late cancel() is harmless', function(done) {
    serveUntilRequest(server, (exchange) => {
      respondWithInvalidToken(exchange);
    }, done);

    // A short cancel timeout: before the fix, the late `cancel()` below armed
    // this timer on the already-closed connection, and its expiry dispatched
    // `socketError` in `Final` (the "No event ... in state 'Final'" error).
    const connection = createConnection({ cancelTimeout: 50 });

    const connectionErrors: Error[] = [];
    connection.on('error', (err) => {
      connectionErrors.push(err);
    });

    connection.connect((err) => {
      assert.isUndefined(err);

      const request = new Request('select 1', (err) => {
        assert.instanceOf(err, Error);
        assert.match((err as Error).message, /Unknown type/);

        // A user-side timeout racing the failure: must not write an attention
        // packet to the destroyed socket nor arm a cancel timer on it.
        request.cancel();

        // Wait past `cancelTimeout` so a wrongly armed timer would have fired.
        setTimeout(() => {
          // Exactly the one wrapped parse error, nothing from the cancel.
          assert.lengthOf(connectionErrors, 1);
          assert.match(connectionErrors[0].message, /Unknown type/);
          done();
        }, 250);
      });

      connection.execSqlBatch(request);
    });
  });

  it('fails a canceled request whose attention acknowledgement is malformed', function(done) {
    let signalRequestReceived!: () => void;
    const requestReceived = new Promise<void>((resolve) => {
      signalRequestReceived = resolve;
    });

    serveUntilRequest(server, async ({ messageIterator, outgoingMessageStream }) => {
      // No response before the attention message arrives.
      signalRequestReceived();

      // ATTENTION
      const { value: message } = await messageIterator.next();
      assert.strictEqual(message.type, 0x06);

      await drainMessage(message);

      // The response to the canceled request, then a malformed
      // acknowledgement message.
      const responseMessage = new Message({ type: 0x04 });
      responseMessage.end(buildDoneToken());
      outgoingMessageStream.write(responseMessage);

      const ackMessage = new Message({ type: 0x04 });
      ackMessage.end(Buffer.from([0x00]));
      outgoingMessageStream.write(ackMessage);
    }, done);

    const connection = createConnection({ cancelTimeout: 0 });

    connection.on('error', () => {
      // The parse failure is also surfaced as a connection error.
    });

    connection.connect((err) => {
      assert.isUndefined(err);

      const request = new Request('select 1', (err) => {
        assert.instanceOf(err, Error);
        assert.match((err as Error).message, /Unknown type/);

        connection.close();
        done();
      });

      connection.execSqlBatch(request);

      requestReceived.then(() => {
        request.cancel();
      });
    });
  });
});
