import { assert } from 'chai';
import * as net from 'net';
import { getEventListeners } from 'events';
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
 * Builds a `ROW` token for a single non-null `int` column.
 */
function buildRowToken(value: number): Buffer {
  const buffer = Buffer.alloc(5);
  buffer.writeUInt8(0xD1, 0); // ROW
  buffer.writeInt32LE(value, 1);
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

/**
 * Handles the connection establishment sequence (`PRELOGIN`, `LOGIN7` and
 * the initial SQL batch) of the fake server.
 */
async function performHandshake(messageIterator: AsyncIterator<Message>, outgoingMessageStream: OutgoingMessageStream): Promise<void> {
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
}

describe('Aborting a request via an `AbortSignal`', function() {
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

  it('throws a `TypeError` when the `signal` option is not an `AbortSignal`', function() {
    const connection = new Connection({
      server: (server.address() as net.AddressInfo).address,
      options: {
        port: (server.address() as net.AddressInfo).port,
        encrypt: false
      }
    });

    const request = new Request('select 1', () => {
      assert.fail('expected the request callback to not be called');
    });

    assert.throws(() => {
      connection.execSqlBatch(request, { signal: {} as AbortSignal });
    }, TypeError, 'The "options.signal" property must be an instance of AbortSignal');
  });

  it('accepts a cross-realm or ponyfilled `AbortSignal`-like object', function(done) {
    server.on('connection', async (connection) => {
      const debug = new Debug();
      const incomingMessageStream = new IncomingMessageStream(debug);
      const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

      connection.pipe(incomingMessageStream);
      outgoingMessageStream.pipe(connection);

      try {
        const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

        await performHandshake(messageIterator, outgoingMessageStream);

        // SQL Batch (`select 1`)
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end(buildDoneToken(3));
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

      // An `AbortSignal`-shaped object that is not an instance of this
      // realm's `AbortSignal` - like a signal from another realm or a
      // ponyfill. Validation is duck-typed (matching Node core's
      // `validateAbortSignal`), so this must be accepted.
      const added: [string, unknown][] = [];
      const removed: [string, unknown][] = [];
      const fakeSignal = {
        aborted: false,
        reason: undefined,
        addEventListener(type: string, listener: unknown) {
          added.push([type, listener]);
        },
        removeEventListener(type: string, listener: unknown) {
          removed.push([type, listener]);
        }
      };

      const request = new Request('select 1', (err, rowCount) => {
        assert.isUndefined(err);
        assert.strictEqual(rowCount, 3);

        // The `abort` listener was armed on the signal-like object and
        // removed again when the request completed.
        assert.lengthOf(added, 1);
        assert.strictEqual(added[0][0], 'abort');
        assert.lengthOf(removed, 1);
        assert.strictEqual(removed[0][1], added[0][1]);

        connection.close();
      });

      connection.execSqlBatch(request, { signal: fakeSignal as unknown as AbortSignal });
    });

    connection.on('end', () => {
      done();
    });
  });

  it('fails the request with the abort reason without sending it when the signal is already aborted', function(done) {
    server.on('connection', async (connection) => {
      const debug = new Debug();
      const incomingMessageStream = new IncomingMessageStream(debug);
      const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

      connection.pipe(incomingMessageStream);
      outgoingMessageStream.pipe(connection);

      try {
        const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

        await performHandshake(messageIterator, outgoingMessageStream);

        // SQL Batch (`select 2`) - the aborted request must never reach
        // the server, so the next message is the follow-up request.
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

      const reason = new Error('operation was retired');
      const controller = new AbortController();
      controller.abort(reason);

      const request = new Request('select 1', (err) => {
        assert.strictEqual(err, reason);

        // No `abort` listener may be left on the signal.
        assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);

        // The connection was not affected by the aborted request: the
        // next request must complete normally.
        const secondRequest = new Request('select 2', (err, rowCount) => {
          assert.isUndefined(err);
          assert.strictEqual(rowCount, 7);

          connection.close();
        });

        connection.execSqlBatch(secondRequest);
      });

      connection.execSqlBatch(request, { signal: controller.signal });
    });

    connection.on('end', () => {
      done();
    });
  });

  it('fails the request with an `EABORT` `RequestError` when the abort reason is not an `Error`', function(done) {
    server.on('connection', async (connection) => {
      const debug = new Debug();
      const incomingMessageStream = new IncomingMessageStream(debug);
      const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

      connection.pipe(incomingMessageStream);
      outgoingMessageStream.pipe(connection);

      try {
        const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

        await performHandshake(messageIterator, outgoingMessageStream);
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

      const controller = new AbortController();
      controller.abort('not an error');

      const request = new Request('select 1', (err) => {
        assert.instanceOf(err, RequestError);
        assert.strictEqual((err as RequestError).code, 'EABORT');
        assert.strictEqual((err as RequestError).cause, 'not an error');

        connection.close();
      });

      connection.execSqlBatch(request, { signal: controller.signal });
    });

    connection.on('end', () => {
      done();
    });
  });

  it('fails a transaction request with the abort reason when the signal is already aborted', function(done) {
    server.on('connection', async (connection) => {
      const debug = new Debug();
      const incomingMessageStream = new IncomingMessageStream(debug);
      const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

      connection.pipe(incomingMessageStream);
      outgoingMessageStream.pipe(connection);

      try {
        const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

        await performHandshake(messageIterator, outgoingMessageStream);

        // SQL Batch (`select 2`) - the aborted transaction request must
        // never reach the server, so the next message is the follow-up
        // request.
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

      const reason = new Error('transaction was abandoned');
      const controller = new AbortController();
      controller.abort(reason);

      connection.beginTransaction((err) => {
        assert.strictEqual(err, reason);

        // The connection was not affected by the aborted transaction
        // request: the next request must complete normally.
        const request = new Request('select 2', (err, rowCount) => {
          assert.isUndefined(err);
          assert.strictEqual(rowCount, 7);

          connection.close();
        });

        connection.execSqlBatch(request);
      }, '', undefined, { signal: controller.signal });
    });

    connection.on('end', () => {
      done();
    });
  });

  it('completes the request with the abort reason when aborted after the request was sent', function(done) {
    // Used by the server side to signal to the client side that the request
    // message was fully received. Aborting after this point guarantees the
    // cancellation is performed by sending an attention message.
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

        await performHandshake(messageIterator, outgoingMessageStream);

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
          // first the response to the aborted request, then a separate
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

      const controller = new AbortController();

      const request = new Request('select 1', (err) => {
        // `controller.abort()` was called without an explicit reason, so
        // the request completes with the default `AbortError`.
        assert.instanceOf(err, Error);
        assert.strictEqual(err!.name, 'AbortError');
        assert.strictEqual(err, controller.signal.reason);

        // No `abort` listener may be left on the signal.
        assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);

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

      connection.execSqlBatch(request, { signal: controller.signal });

      // Abort the request once the server received the request message.
      requestReceived.then(() => {
        controller.abort();
      });
    });

    connection.on('end', () => {
      done();
    });
  });

  it('completes the request with a `TimeoutError` when an `AbortSignal.timeout()` signal expires', function(done) {
    this.timeout(2000);

    server.on('connection', async (connection) => {
      const debug = new Debug();
      const incomingMessageStream = new IncomingMessageStream(debug);
      const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

      connection.pipe(incomingMessageStream);
      outgoingMessageStream.pipe(connection);

      try {
        const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

        await performHandshake(messageIterator, outgoingMessageStream);

        // SQL Batch (`select 1`) - the server never responds, like a
        // server executing a long-running query. The timeout signal
        // expires while the client is waiting for the response.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);
        }

        // ATTENTION - sent when the timeout signal expired.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x06);

          await drainMessage(message);

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end(buildDoneToken());
          outgoingMessageStream.write(responseMessage);

          const ackMessage = new Message({ type: 0x04 });
          ackMessage.end(buildAttentionAckToken());
          outgoingMessageStream.write(ackMessage);
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

      const signal = AbortSignal.timeout(200);

      const request = new Request('select 1', (err) => {
        assert.instanceOf(err, Error);
        assert.strictEqual(err!.name, 'TimeoutError');
        assert.strictEqual(err, signal.reason);

        // No `abort` listener may be left on the signal.
        assert.lengthOf(getEventListeners(signal, 'abort'), 0);

        connection.close();
      });

      connection.execSqlBatch(request, { signal });
    });

    connection.on('end', () => {
      done();
    });
  });

  it('fails a bulk load with the abort reason without sending it when the signal is already aborted', function(done) {
    server.on('connection', async (connection) => {
      const debug = new Debug();
      const incomingMessageStream = new IncomingMessageStream(debug);
      const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

      connection.pipe(incomingMessageStream);
      outgoingMessageStream.pipe(connection);

      try {
        const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

        await performHandshake(messageIterator, outgoingMessageStream);

        // SQL Batch (`select 2`) - neither the `insert bulk` statement nor
        // the bulk load message of the aborted bulk load must reach the
        // server, so the next message is the follow-up request.
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

      const reason = new Error('bulk load was abandoned');
      const controller = new AbortController();
      controller.abort(reason);

      const bulkLoad = connection.newBulkLoad('#tmp', (err) => {
        assert.strictEqual(err, reason);

        // The connection was not affected by the aborted bulk load: the
        // next request must complete normally.
        const request = new Request('select 2', (err, rowCount) => {
          assert.isUndefined(err);
          assert.strictEqual(rowCount, 7);

          connection.close();
        });

        connection.execSqlBatch(request);
      });

      bulkLoad.addColumn('a', TYPES.Int, { nullable: false });

      connection.execBulkLoad(bulkLoad, [{ a: 1 }], { signal: controller.signal });
    });

    connection.on('end', () => {
      done();
    });
  });

  it('completes a bulk load with the abort reason when aborted while the bulk load message is being sent', function(done) {
    // Used by the client side to signal to the server side that the bulk
    // load was aborted.
    let signalAborted!: () => void;
    const bulkLoadAborted = new Promise<void>((resolve) => {
      signalAborted = resolve;
    });

    server.on('connection', async (connection) => {
      const debug = new Debug();
      const incomingMessageStream = new IncomingMessageStream(debug);
      const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

      connection.pipe(incomingMessageStream);
      outgoingMessageStream.pipe(connection);

      try {
        const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

        await performHandshake(messageIterator, outgoingMessageStream);

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

          // Wait until the client aborted the bulk load before reading
          // the bulk load message, so that the abort is guaranteed
          // to happen while the bulk load message is still being sent.
          await bulkLoadAborted;

          // Drain the bulk load message. As the bulk load was aborted
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
        // in between, as the aborted bulk load message was never
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

      const reason = new Error('bulk load was abandoned');
      const controller = new AbortController();

      const bulkLoad = connection.newBulkLoad('#tmp', (err) => {
        assert.strictEqual(err, reason);

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
      // stays in flight until the bulk load is aborted. The first row
      // is large enough to fill a packet, so the server starts receiving
      // the bulk load message right away.
      connection.execBulkLoad(bulkLoad, (async function*() {
        yield [Buffer.alloc(8000)];

        await new Promise<unknown>(() => {
          // This promise never resolves.
        });
      })(), { signal: controller.signal });

      // Abort the bulk load once the first part of the response message
      // has arrived, while the bulk load message is still being sent.
      bulkLoad.on('columnMetadata', () => {
        controller.abort(reason);
        signalAborted();
      });
    });

    connection.on('end', () => {
      done();
    });
  });

  it('completes the request with the abort reason when aborted while the response is streaming', function(done) {
    // Used by the client side to signal to the server side that the
    // request was aborted.
    let signalAborted!: () => void;
    const requestAborted = new Promise<void>((resolve) => {
      signalAborted = resolve;
    });

    server.on('connection', async (connection) => {
      const debug = new Debug();
      const incomingMessageStream = new IncomingMessageStream(debug);
      const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

      connection.pipe(incomingMessageStream);
      outgoingMessageStream.pipe(connection);

      try {
        const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

        await performHandshake(messageIterator, outgoingMessageStream);

        // SQL Batch (`select 1`) - the response starts streaming (column
        // metadata and two rows), but the response message is not
        // finished before the abort happens.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);

          const packet = new Packet(0x04);
          packet.packetId(1);
          packet.addData(Buffer.concat([buildColMetadataToken(), buildRowToken(1), buildRowToken(2)]));
          connection.write(packet.buffer);
        }

        // ATTENTION - sent when the client aborted the request while its
        // response was streaming.
        {
          await requestAborted;

          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x06);

          await drainMessage(message);

          // Finish the (cut short) response to the aborted request, then
          // acknowledge the attention message in a separate message.
          const finalPacket = new Packet(0x04);
          finalPacket.packetId(2);
          finalPacket.last(true);
          finalPacket.addData(buildDoneToken());
          connection.write(finalPacket.buffer);

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

      const reason = new Error('no more rows needed');
      const controller = new AbortController();

      let rowsSeen = 0;

      const request = new Request('select 1', (err) => {
        assert.strictEqual(err, reason);
        assert.strictEqual(rowsSeen, 2);

        // No `abort` listener may be left on the signal.
        assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);

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

      // Abort the request once the first rows of the response arrived.
      request.on('row', () => {
        rowsSeen += 1;

        if (rowsSeen === 2) {
          controller.abort(reason);
          signalAborted();
        }
      });

      connection.execSqlBatch(request, { signal: controller.signal });
    });

    connection.on('end', () => {
      done();
    });
  });

  it('completes the request with the abort reason when the request timer would fire after the abort', function(done) {
    this.timeout(2000);

    // Used by the server side to signal to the client side that the
    // request message was fully received.
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

        await performHandshake(messageIterator, outgoingMessageStream);

        // SQL Batch (`select 1`) - no response is sent before
        // the attention message arrives.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);

          signalRequestReceived();
        }

        // ATTENTION - sent when the client aborted the request. The
        // acknowledgement is delayed beyond the request timeout, so a
        // request timer that was (incorrectly) left running would fire
        // during this window and overwrite the abort reason with an
        // `ETIMEOUT` error.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x06);

          await drainMessage(message);

          await new Promise((resolve) => setTimeout(resolve, 250));

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end(buildDoneToken());
          outgoingMessageStream.write(responseMessage);

          const ackMessage = new Message({ type: 0x04 });
          ackMessage.end(buildAttentionAckToken());
          outgoingMessageStream.write(ackMessage);
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
        requestTimeout: 100,
        cancelTimeout: 0
      }
    });

    connection.connect((err) => {
      assert.isUndefined(err);

      const reason = new Error('operation was retired');
      const controller = new AbortController();

      const request = new Request('select 1', (err) => {
        assert.strictEqual(err, reason);

        connection.close();
      });

      connection.execSqlBatch(request, { signal: controller.signal });

      // Abort the request once the server received the request message,
      // well before the request timeout expires.
      requestReceived.then(() => {
        controller.abort(reason);
      });
    });

    connection.on('end', () => {
      done();
    });
  });

  it('completes the request with `ETIMEOUT` when the request timeout fired before the signal was aborted', function(done) {
    this.timeout(2000);

    // Used by the client side to signal to the server side that the
    // signal was aborted (after the request timeout already canceled the
    // request).
    let signalAborted!: () => void;
    const requestAborted = new Promise<void>((resolve) => {
      signalAborted = resolve;
    });

    // Used by the server side to signal to the client side that the
    // attention message (sent by the request timeout's cancellation)
    // was received.
    let signalAttentionReceived!: () => void;
    const attentionReceived = new Promise<void>((resolve) => {
      signalAttentionReceived = resolve;
    });

    server.on('connection', async (connection) => {
      const debug = new Debug();
      const incomingMessageStream = new IncomingMessageStream(debug);
      const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

      connection.pipe(incomingMessageStream);
      outgoingMessageStream.pipe(connection);

      try {
        const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

        await performHandshake(messageIterator, outgoingMessageStream);

        // SQL Batch (`select 1`) - no response is sent, so the request
        // timeout expires and cancels the request.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);
        }

        // ATTENTION - sent by the request timeout's cancellation.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x06);

          await drainMessage(message);

          signalAttentionReceived();

          // Wait until the client aborted the signal, so that the abort
          // is guaranteed to happen after the timeout.
          await requestAborted;

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end(buildDoneToken());
          outgoingMessageStream.write(responseMessage);

          const ackMessage = new Message({ type: 0x04 });
          ackMessage.end(buildAttentionAckToken());
          outgoingMessageStream.write(ackMessage);
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
        requestTimeout: 50,
        cancelTimeout: 0
      }
    });

    connection.connect((err) => {
      assert.isUndefined(err);

      const reason = new Error('too late');
      const controller = new AbortController();

      const request = new Request('select 1', (err) => {
        // The request timeout fired first, so its `ETIMEOUT` error wins
        // over the abort reason.
        assert.instanceOf(err, RequestError);
        assert.strictEqual((err as RequestError).code, 'ETIMEOUT');
        assert.notStrictEqual(err, reason);

        connection.close();
      });

      connection.execSqlBatch(request, { signal: controller.signal });

      // Abort the signal only after the request timeout already canceled
      // the request.
      attentionReceived.then(() => {
        controller.abort(reason);
        signalAborted();
      });
    });

    connection.on('end', () => {
      done();
    });
  });

  it('fails a bulk load with the abort reason when aborted during the `insert bulk` statement', function(done) {
    // Used by the server side to signal to the client side that the
    // `insert bulk` statement was fully received.
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

        await performHandshake(messageIterator, outgoingMessageStream);

        // SQL Batch (`insert bulk ...`) - no response is sent before
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

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end(buildDoneToken());
          outgoingMessageStream.write(responseMessage);

          const ackMessage = new Message({ type: 0x04 });
          ackMessage.end(buildAttentionAckToken());
          outgoingMessageStream.write(ackMessage);
        }

        // SQL Batch (`select 2`) - the bulk load message (0x07) must
        // never be sent, as the bulk load was aborted during its
        // `insert bulk` statement.
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

      const reason = new Error('bulk load was abandoned');
      const controller = new AbortController();

      const bulkLoad = connection.newBulkLoad('#tmp', (err) => {
        assert.strictEqual(err, reason);

        // The message stream should still be aligned: the next request
        // must receive its own response.
        const secondRequest = new Request('select 2', (err, rowCount) => {
          assert.isUndefined(err);
          assert.strictEqual(rowCount, 7);

          connection.close();
        });

        connection.execSqlBatch(secondRequest);
      });

      bulkLoad.addColumn('a', TYPES.Int, { nullable: false });

      connection.execBulkLoad(bulkLoad, [{ a: 1 }], { signal: controller.signal });

      // Abort the bulk load once the server received the `insert bulk`
      // statement, before the bulk load message itself was sent.
      requestReceived.then(() => {
        controller.abort(reason);
      });
    });

    connection.on('end', () => {
      done();
    });
  });

  it('removes the `abort` listener from the signal when the connection is closed while a request is in flight', function(done) {
    // Used by the server side to signal to the client side that the
    // request message was fully received.
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

        await performHandshake(messageIterator, outgoingMessageStream);

        // SQL Batch (`select 1`) - the server never responds; the
        // connection is closed by the client while the request is in
        // flight.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);

          signalRequestReceived();
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

    const controller = new AbortController();

    connection.connect((err) => {
      assert.isUndefined(err);

      const request = new Request('select 1', (err) => {
        assert.instanceOf(err, RequestError);
        assert.strictEqual((err as RequestError).code, 'ECLOSE');
      });

      connection.execSqlBatch(request, { signal: controller.signal });

      // Close the connection once the server received the request
      // message, while the `abort` listener is armed.
      requestReceived.then(() => {
        assert.lengthOf(getEventListeners(controller.signal, 'abort'), 1);

        connection.close();
      });
    });

    connection.on('end', () => {
      // The `abort` listener must have been removed when the connection
      // was torn down.
      assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);

      done();
    });
  });

  it('removes the `abort` listener from the signal when the request completes normally', function(done) {
    server.on('connection', async (connection) => {
      const debug = new Debug();
      const incomingMessageStream = new IncomingMessageStream(debug);
      const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

      connection.pipe(incomingMessageStream);
      outgoingMessageStream.pipe(connection);

      try {
        const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

        await performHandshake(messageIterator, outgoingMessageStream);

        // SQL Batch (`select 1`)
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end(buildDoneToken(3));
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

      const controller = new AbortController();

      const request = new Request('select 1', (err, rowCount) => {
        assert.isUndefined(err);
        assert.strictEqual(rowCount, 3);

        // The `abort` listener must have been removed - a long-lived
        // signal must not accumulate listeners across requests.
        assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);

        connection.close();
      });

      connection.execSqlBatch(request, { signal: controller.signal });

      // While the request is in flight, the `abort` listener is armed.
      assert.lengthOf(getEventListeners(controller.signal, 'abort'), 1);
    });

    connection.on('end', () => {
      done();
    });
  });
});
