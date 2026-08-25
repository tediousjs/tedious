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
 * Builds a final `DONE` token, optionally with a row count.
 */
function buildDoneToken(rowCount?: number): Buffer {
  const buffer = Buffer.alloc(13);

  let offset = 0;
  offset = buffer.writeUInt8(0xFD, offset); // DONE
  offset = buffer.writeUInt16LE(rowCount !== undefined ? 0x0010 : 0x0000, offset); // status = DONE_COUNT or DONE_FINAL
  offset = buffer.writeUInt16LE(0x0000, offset); // curCmd
  buffer.writeBigUInt64LE(BigInt(rowCount ?? 0), offset); // rowCount

  return buffer;
}

/**
 * Builds a `COLMETADATA` token for a single `int` column named `a`.
 */
function buildColMetadataToken(): Buffer {
  return Buffer.from([
    0x81, // COLMETADATA
    0x01, 0x00, // column count
    0x00, 0x00, 0x00, 0x00, // userType
    0x00, 0x00, // flags
    0x38, // INT4
    0x01, 0x61, 0x00 // column name - 'a'
  ]);
}

/**
 * Builds a `ROW` token containing a single `int` value.
 */
function buildRowToken(value: number): Buffer {
  const buffer = Buffer.alloc(5);
  buffer.writeUInt8(0xD1, 0); // ROW
  buffer.writeInt32LE(value, 1);
  return buffer;
}

/**
 * Builds a single raw TDS packet (type `0x04` - tabular response) around the
 * given payload, so the server side can send an individual packet - including
 * a non-final one - directly to the socket, outside of a `Message`.
 */
function buildRawPacket(payload: Buffer, isLast: boolean): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt8(0x04, 0); // type - tabular response
  header.writeUInt8(isLast ? 0x01 : 0x00, 1); // status - EOM or normal
  header.writeUInt16BE(8 + payload.length, 2); // length, including header

  return Buffer.concat([header, payload]);
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

/**
 * Serves the prelogin / login / initial SQL exchange, then hands the raw
 * socket to `onRequest` when the first request message arrives.
 */
function serveUntilRequest(server: net.Server, onRequest: (connection: net.Socket) => void, onError: (err: Error) => void) {
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

      // SQL Batch (the request under test) - from here on, the test
      // scripts the response itself, writing raw packets to the socket.
      {
        const { value: message } = await messageIterator.next();
        assert.strictEqual(message.type, 0x01);

        await drainMessage(message);

        onRequest(connection);
      }
    } catch (err: any) {
      onError(err);
    }
  });
}

describe('A request whose response has started arriving', function() {
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

  it('errors after the inactivity budget when the response stalls after the first packet', function(done) {
    serveUntilRequest(server, (connection) => {
      // Send the first packet of the response, then go silent forever.
      connection.write(buildRawPacket(buildColMetadataToken(), false));
    }, done);

    const connection = new Connection({
      server: (server.address() as net.AddressInfo).address,
      options: {
        port: (server.address() as net.AddressInfo).port,
        encrypt: false,
        requestTimeout: 200,
        cancelTimeout: 100
      }
    });

    connection.on('error', () => {
      // The forced socket error also surfaces as a connection error.
    });

    connection.connect((err) => {
      assert.isUndefined(err);

      const start = Date.now();
      const request = new Request('select 1', (err) => {
        // Without the inactivity timer, this callback is never reached:
        // the request timer was cleared when the first packet arrived,
        // and nothing else bounds the remainder of the response.
        assert.instanceOf(err, Error);
        assert.strictEqual((err as any).code, 'ETIMEOUT');

        // requestTimeout (200ms of silence) plus the cancel timeout (100ms).
        const elapsed = Date.now() - start;
        assert.isAtLeast(elapsed, 190);

        connection.close();
        done();
      });

      connection.execSqlBatch(request);
    });
  });

  it('completes a slow response whose per-chunk gaps stay under the budget', function(done) {
    serveUntilRequest(server, (connection) => {
      // Three chunks, 220ms apart: total time (~440ms) exceeds the 300ms
      // `requestTimeout`, but no single silent gap does. A total-time
      // interpretation of the timeout would fail this request.
      connection.write(buildRawPacket(buildColMetadataToken(), false));

      setTimeout(() => {
        connection.write(buildRawPacket(buildRowToken(8), false));

        setTimeout(() => {
          connection.write(buildRawPacket(buildDoneToken(1), true));
        }, 220);
      }, 220);
    }, done);

    const connection = new Connection({
      server: (server.address() as net.AddressInfo).address,
      options: {
        port: (server.address() as net.AddressInfo).port,
        encrypt: false,
        requestTimeout: 300
      }
    });

    connection.on('error', done);

    connection.connect((err) => {
      assert.isUndefined(err);

      const start = Date.now();
      const request = new Request('select 8 as a', (err, rowCount) => {
        assert.isUndefined(err);
        assert.strictEqual(rowCount, 1);
        assert.isAtLeast(Date.now() - start, 400);

        connection.close();
        done();
      });

      connection.execSqlBatch(request);
    });
  });

  it('surfaces a token parse failure as a request error instead of an unhandled stream error', function(done) {
    serveUntilRequest(server, (connection) => {
      // 0x00 is not a valid token type - parsing this response throws.
      connection.write(buildRawPacket(Buffer.from([0x00]), true));
    }, done);

    const connection = new Connection({
      server: (server.address() as net.AddressInfo).address,
      options: {
        port: (server.address() as net.AddressInfo).port,
        encrypt: false
      }
    });

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
});
