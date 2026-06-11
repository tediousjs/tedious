import { assert } from 'chai';
import * as net from 'net';
import { Connection, Request, RequestError } from '../../src/tedious';
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
 * Builds a `DONE` token that acknowledges a previously sent attention message.
 */
function buildAttentionAckToken(): Buffer {
  const buffer = Buffer.alloc(13);

  let offset = 0;
  offset = buffer.writeUInt8(0xFD, offset); // DONE
  offset = buffer.writeUInt16LE(0x0020, offset); // status = DONE_ATTN
  offset = buffer.writeUInt16LE(0x0000, offset); // curCmd
  buffer.writeBigUInt64LE(0n, offset); // rowCount

  return buffer;
}

describe('Canceling a request', function() {
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

  it('should complete the canceled request and leave the message stream aligned when `cancelTimeout` is disabled', function(done) {
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

        // SQL Batch (`select 1`) - no response is sent before
        // the attention message arrives.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          const chunks: Buffer[] = [];
          for await (const data of message) {
            chunks.push(data);
          }
        }

        // ATTENTION
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x06);

          const chunks: Buffer[] = [];
          for await (const data of message) {
            chunks.push(data);
          }

          // Every client request receives exactly one response message:
          // first the response to the canceled request, then a separate
          // message containing only the `DONE` token that acknowledges
          // the attention message.
          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end(buildDoneToken());
          outgoingMessageStream.write(responseMessage);

          const ackMessage = new Message({ type: 0x04 });
          ackMessage.end(buildAttentionAckToken());
          outgoingMessageStream.write(ackMessage);
        }

        // SQL Batch (`select 2`)
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          const chunks: Buffer[] = [];
          for await (const data of message) {
            chunks.push(data);
          }

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end(buildDoneToken(7));
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
        encrypt: false,
        cancelTimeout: 0
      }
    });

    connection.connect((err) => {
      assert.isUndefined(err);

      const request = new Request('select 1', (err) => {
        assert.instanceOf(err, RequestError);
        assert.strictEqual(err.code, 'ECANCEL');

        // The message stream should still be aligned: the next request
        // must receive its own response, not the leftover attention
        // acknowledgement message.
        const secondRequest = new Request('select 2', (err, rowCount) => {
          assert.isUndefined(err);
          assert.strictEqual(rowCount, 7);

          connection.close();
        });

        connection.execSqlBatch(secondRequest);
      });

      connection.execSqlBatch(request);

      // Cancel the request once the request message has been sent off.
      setTimeout(() => {
        connection.cancel();
      }, 50);
    });

    connection.on('end', () => {
      done();
    });
  });

  it('should complete the request with `ECANCEL` when canceled before the request message was fully sent', function(done) {
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

        // SQL Batch (`select 1`) - the request message was canceled
        // while it was being sent, so its final packet carries the
        // `IGNORE` bit. The server discards the request, but still
        // responds with a (empty) response message.
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

        // SQL Batch (`select 2`) - no attention message is expected
        // in between, as the canceled request was never fully sent.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          const chunks: Buffer[] = [];
          for await (const data of message) {
            chunks.push(data);
          }

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end(buildDoneToken(7));
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

    connection.connect((err) => {
      assert.isUndefined(err);

      const request = new Request('select 1', (err) => {
        assert.instanceOf(err, RequestError);
        assert.strictEqual(err.code, 'ECANCEL');

        // The message stream should still be aligned: the next request
        // must receive its own response.
        const secondRequest = new Request('select 2', (err, rowCount) => {
          assert.isUndefined(err);
          assert.strictEqual(rowCount, 7);

          connection.close();
        });

        connection.execSqlBatch(secondRequest);
      });

      connection.execSqlBatch(request);

      // Cancel the request immediately, before the request message
      // was fully sent off.
      connection.cancel();
    });

    connection.on('end', () => {
      done();
    });
  });
});
