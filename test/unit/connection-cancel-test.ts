import { assert } from 'chai';
import * as net from 'net';
import { Connection, Request, RequestError, TYPES } from '../../src/tedious';
import IncomingMessageStream from '../../src/incoming-message-stream';
import OutgoingMessageStream from '../../src/outgoing-message-stream';
import Debug from '../../src/debug';
import PreloginPayload from '../../src/prelogin-payload';
import Message from '../../src/message';
import { Packet } from '../../src/packet';

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
 * Reads and discards all data of the given message.
 */
async function drainMessage(message: Message): Promise<void> {
  const iterator = message[Symbol.asyncIterator]();
  while (!(await iterator.next()).done) {
    // Discard the data.
  }
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
          responseMessage.end(buildLoginAckToken());
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

        // SQL Batch (`select 1`) - no response is sent before
        // the attention message arrives.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);
        }

        // ATTENTION
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x06);

          await drainMessage(message);

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

          await drainMessage(message);

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end(buildDoneToken(7));
          outgoingMessageStream.write(responseMessage);
        }
      } catch (err: any) {
        done(err);
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

      // Cancel the request after a short delay, to ensure the request
      // message was fully sent off and the cancellation is performed by
      // sending an attention message, not by terminating the request
      // message with the `IGNORE` bit set.
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
          responseMessage.end(buildLoginAckToken());
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

        // SQL Batch (`select 1`) - the request message was canceled
        // while it was being sent, so its final packet carries the
        // `IGNORE` bit. The server discards the request, but still
        // responds with a (empty) response message.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end();
          outgoingMessageStream.write(responseMessage);
        }

        // SQL Batch (`select 2`) - no attention message is expected
        // in between, as the canceled request was never fully sent.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end(buildDoneToken(7));
          outgoingMessageStream.write(responseMessage);
        }
      } catch (err: any) {
        done(err);
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

  it('should complete the request with `ECANCEL` when canceled while the request message is being sent and the response already started arriving', function(done) {
    // Used by the client side to signal to the server side that the request
    // was canceled.
    let signalCanceled!: () => void;
    const requestCanceled = new Promise<void>((resolve) => {
      signalCanceled = resolve;
    });

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
          responseMessage.end(buildLoginAckToken());
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

        // SQL Batch (`insert bulk ...`)
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end();
          outgoingMessageStream.write(responseMessage);
        }

        // Bulk Load
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x07);

          // Send the first packet of the response message right away,
          // while the client is still sending the bulk load message,
          // like a server would do when it encounters an error in the
          // middle of a bulk load.
          const packet = new Packet(0x04);
          packet.packetId(1);
          packet.addData(buildColMetadataToken());
          connection.write(packet.buffer);

          // Wait until the client canceled the bulk load before reading
          // the bulk load message, so that the cancellation is guaranteed
          // to happen while the bulk load message is still being sent.
          await requestCanceled;

          // Drain the bulk load message. As the bulk load was canceled
          // while it was being sent, the message ends with the `IGNORE`
          // bit set.
          await drainMessage(message);

          // Finish the response message.
          const finalPacket = new Packet(0x04);
          finalPacket.packetId(2);
          finalPacket.last(true);
          finalPacket.addData(buildDoneToken());
          connection.write(finalPacket.buffer);
        }

        // SQL Batch (`select 2`) - no attention message is expected
        // in between, as the canceled bulk load message was never
        // fully sent.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end(buildDoneToken(7));
          outgoingMessageStream.write(responseMessage);
        }
      } catch (err: any) {
        done(err);
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

      const bulkLoad = connection.newBulkLoad('#tmp', (err) => {
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

      bulkLoad.addColumn('a', TYPES.VarBinary, { length: 8000, nullable: false });

      // A row stream that never completes, so the bulk load message
      // stays in flight until the bulk load is canceled. The first row
      // is large enough to fill a packet, so the server starts receiving
      // the bulk load message right away.
      connection.execBulkLoad(bulkLoad, (async function*() {
        yield [Buffer.alloc(8000)];

        await new Promise<unknown>(() => {
          // This promise never resolves.
        });
      })());

      // Cancel the bulk load once its message is being sent and the
      // first part of the response message has arrived.
      setTimeout(() => {
        connection.cancel();
        signalCanceled();
      }, 100);
    });

    connection.on('end', () => {
      done();
    });
  });
});
