import { assert } from 'chai';
import * as net from 'net';
import { Connection, ConnectionError, Request, RequestError, TYPES } from '../../src/tedious';
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
 * Builds an `ERROR` token, as a server would send when it encounters an
 * error in the middle of processing a request (e.g. a failing bulk load).
 */
function buildErrorToken(): Buffer {
  const message = 'Bulk load data conversion error.';
  const messageData = Buffer.from(message, 'ucs2');

  const data = Buffer.alloc(4 + 1 + 1 + 2 + messageData.length + 1 + 1 + 4);

  let offset = 0;
  offset = data.writeUInt32LE(4815, offset); // number
  offset = data.writeUInt8(1, offset); // state
  offset = data.writeUInt8(16, offset); // class
  offset = data.writeUInt16LE(message.length, offset); // message length (in characters)
  offset += messageData.copy(data, offset); // message
  offset = data.writeUInt8(0, offset); // server name length
  offset = data.writeUInt8(0, offset); // proc name length
  data.writeUInt32LE(0, offset); // line number (TDS 7.2+)

  const buffer = Buffer.alloc(3 + data.length);
  buffer.writeUInt8(0xAA, 0); // ERROR
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
    // Used by the server side to signal to the client side that the request
    // message was fully received. Canceling after this point guarantees the
    // cancellation is performed by sending an attention message, not by
    // terminating the request message with the `IGNORE` bit set.
    let signalRequestReceived!: () => void;
    const requestReceived = new Promise<void>((resolve) => {
      signalRequestReceived = resolve;
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

        // SQL Batch (`select 1`) - no response is sent before
        // the attention message arrives.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);

          signalRequestReceived();
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

      // Cancel the request once the server received the request message.
      requestReceived.then(() => {
        connection.cancel();
      });
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

  it('should complete the canceled request within `cancelTimeout` when canceled before the request message was fully sent and the server never responds', function(done) {
    // A request that is canceled before its request message was fully sent
    // is terminated by setting the `IGNORE` bit on the message's final
    // packet. The client then waits for the server's response to the
    // ignored message. If the server never sends that response, the
    // `cancelTimeout` backstop must kick in and fail the request - the
    // request must not be left waiting indefinitely.
    this.timeout(2000);

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

        // SQL Batch (`select 1`) - the request message was canceled while
        // it was being sent, so its final packet carries the `IGNORE` bit.
        // The message is received but never responded to, like a server
        // that has become unresponsive.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);
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
        cancelTimeout: 300
      }
    });

    connection.connect((err) => {
      assert.isUndefined(err);

      let failure: Error | undefined;

      // If the request is still pending well after `cancelTimeout` has
      // elapsed, the backstop did not kick in - fail the test and close
      // the connection ourselves so it can be torn down cleanly.
      const guardTimer = setTimeout(() => {
        failure = new Error('Canceled request was not completed within `cancelTimeout`');
        connection.close();
      }, 1000);

      const request = new Request('select 1', (err) => {
        clearTimeout(guardTimer);

        try {
          // The cancel timer tears down the connection via a synthetic
          // socket error.
          assert.instanceOf(err, ConnectionError);
          assert.strictEqual((err as ConnectionError).code, 'ETIMEOUT');
        } catch (assertionError: any) {
          failure ??= assertionError;
        }

        connection.close();
      });

      connection.execSqlBatch(request);

      // Cancel the request immediately, before the request message
      // was fully sent off.
      connection.cancel();

      connection.on('end', () => {
        done(failure);
      });
    });
  });

  it('should complete the request within `cancelTimeout` when the request timeout expires while the request message is being sent and the server never responds', function(done) {
    // When the request timeout expires, the request is canceled. If the
    // request message was not fully sent yet at that point, it is
    // terminated with the `IGNORE` bit set and the client waits for the
    // server's response to the ignored message. If the server never sends
    // that response, the `cancelTimeout` backstop must kick in and fail
    // the request - the request timeout must not leave the request
    // pending indefinitely.
    this.timeout(3000);

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

        // SQL Batch (`insert bulk ...`)
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end();
          outgoingMessageStream.write(responseMessage);
        }

        // Bulk Load - the request timeout expires while the bulk load
        // message is still being sent, so its final packet carries the
        // `IGNORE` bit. The message is received but never responded to,
        // like a server that has become unresponsive.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x07);

          await drainMessage(message);
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
        requestTimeout: 200,
        cancelTimeout: 300
      }
    });

    connection.connect((err) => {
      assert.isUndefined(err);

      let failure: Error | undefined;

      // If the request is still pending well after `requestTimeout` plus
      // `cancelTimeout` have elapsed, the backstop did not kick in - fail
      // the test and close the connection ourselves so it can be torn
      // down cleanly.
      const guardTimer = setTimeout(() => {
        failure = new Error('Timed out request was not completed within `cancelTimeout`');
        connection.close();
      }, 1500);

      const bulkLoad = connection.newBulkLoad('#tmp', (err) => {
        clearTimeout(guardTimer);

        try {
          // The cancel timer tears down the connection via a synthetic
          // socket error.
          assert.instanceOf(err, ConnectionError);
          assert.strictEqual((err as ConnectionError).code, 'ETIMEOUT');
        } catch (assertionError: any) {
          failure ??= assertionError;
        }

        connection.close();
      });

      bulkLoad.addColumn('a', TYPES.VarBinary, { length: 8000, nullable: false });

      // A row stream that never completes, so the bulk load message is
      // still being sent when the request timeout expires. The first row
      // is large enough to fill a packet, so the server starts receiving
      // the bulk load message right away.
      connection.execBulkLoad(bulkLoad, (async function*() {
        yield [Buffer.alloc(8000)];

        await new Promise<unknown>(() => {
          // This promise never resolves.
        });
      })());

      connection.on('end', () => {
        done(failure);
      });
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

      // Cancel the bulk load once the first part of the response message
      // has arrived, while the bulk load message is still being sent.
      bulkLoad.on('columnMetadata', () => {
        connection.cancel();
        signalCanceled();
      });
    });

    connection.on('end', () => {
      done();
    });
  });

  it('should complete the request with `ECANCEL` when a bulk load is canceled after it was fully sent but the server already responded with an error', function(done) {
    // This models a real bulk load that the server rejects mid-stream: the
    // server starts responding (here with an error) while the client is
    // still sending the bulk load message, the client keeps streaming the
    // remaining rows until the message is fully sent, and only then is the
    // bulk load canceled.
    //
    // In that ordering the client registers its `SentClientRequest` cancel
    // handler (when the response starts arriving) *before* the request
    // message finishes sending (which registers the post-send cancel
    // handler). The post-send handler must still run first so that an
    // attention message is sent and acknowledged; otherwise the attention
    // acknowledgement is left unread and corrupts the next request.

    // Signals (client -> generator) that the error response was received,
    // so the bulk load row stream may complete.
    let signalErrorReceived!: () => void;
    const errorReceived = new Promise<void>((resolve) => {
      signalErrorReceived = resolve;
    });

    // Signals (server -> client) that the full bulk load message was
    // received, which means the client already finished sending it (so its
    // `finish` event fired and the post-send cancel handler is registered).
    // Canceling only after this point exercises the post-send cancel path
    // with a response that started arriving early.
    let signalDrained!: () => void;
    const requestDrained = new Promise<void>((resolve) => {
      signalDrained = resolve;
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

          // Start responding with an error right away, while the client is
          // still sending the bulk load message, like a server would do
          // when it rejects a bulk load (e.g. a data conversion error).
          // The response message is left open (no final packet yet) until
          // the bulk load message has been fully received.
          const packet = new Packet(0x04);
          packet.packetId(1);
          packet.addData(buildErrorToken());
          connection.write(packet.buffer);

          // Drain the rest of the bulk load message. Once this resolves,
          // the client has finished sending the bulk load message, so its
          // `finish` event already fired.
          await drainMessage(message);

          // Now let the client cancel - after the request message was
          // fully sent off.
          signalDrained();

          // The cancellation is performed by sending an attention message.
          const { value: attentionMessage } = await messageIterator.next();
          assert.strictEqual(attentionMessage.type, 0x06);

          await drainMessage(attentionMessage);

          // Finish the (cut short) response to the canceled request.
          const finalPacket = new Packet(0x04);
          finalPacket.packetId(2);
          finalPacket.last(true);
          finalPacket.addData(buildDoneToken());
          connection.write(finalPacket.buffer);

          // Acknowledge the attention message in a separate message.
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

      const bulkLoad = connection.newBulkLoad('#tmp', (err) => {
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

      bulkLoad.addColumn('a', TYPES.VarBinary, { length: 8000, nullable: false });

      // A row stream that completes only once the error response has been
      // received, so the bulk load message is guaranteed to finish sending
      // *after* the response started arriving. The first row is large
      // enough to fill a packet, so the server starts receiving the bulk
      // load message right away.
      connection.execBulkLoad(bulkLoad, (async function*() {
        yield [Buffer.alloc(8000)];

        await errorReceived;
      })());

      connection.on('errorMessage', () => {
        signalErrorReceived();
      });

      // Cancel the bulk load once the server received the full bulk load
      // message, i.e. after the request message was fully sent off.
      requestDrained.then(() => {
        connection.cancel();
      });
    });

    connection.on('end', () => {
      done();
    });
  });
});
