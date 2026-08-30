import { assert } from 'chai';
import * as net from 'net';
import { getEventListeners } from 'events';
import { runInNewContext } from 'vm';
import { Connection, Request, RequestError, TYPES } from '../../src/tedious';
import IncomingMessageStream from '../../src/incoming-message-stream';
import OutgoingMessageStream from '../../src/outgoing-message-stream';
import Debug from '../../src/debug';
import PreloginPayload from '../../src/prelogin-payload';
import Message from '../../src/message';
import { Packet } from '../../src/packet';

function buildLoginAckToken(tdsVersion: number[] = [0x74, 0x00, 0x00, 0x04]): Buffer {
  const progname = 'Tedious SQL Server';

  const buffer = Buffer.from([
    0xAD, // Type
    0x00, 0x00, // Length
    0x00, // interface number - SQL
    ...tdsVersion, // TDS version number
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
 *
 * The row count is 64 bits wide in TDS 7.2 and later, and 32 bits wide
 * in earlier versions.
 */
function buildDoneToken(rowCount?: number, use64BitRowCount = true): Buffer {
  const buffer = Buffer.alloc(use64BitRowCount ? 13 : 9);

  let offset = 0;
  offset = buffer.writeUInt8(0xFD, offset); // DONE
  offset = buffer.writeUInt16LE(rowCount !== undefined ? 0x0010 : 0x0000, offset); // status = DONE_COUNT or DONE_FINAL
  offset = buffer.writeUInt16LE(0x0000, offset); // curCmd
  if (use64BitRowCount) {
    buffer.writeBigUInt64LE(BigInt(rowCount ?? 0), offset); // rowCount
  } else {
    buffer.writeUInt32LE(rowCount ?? 0, offset); // rowCount
  }

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
 * error in the middle of processing a request.
 */
function buildErrorToken(message: string): Buffer {
  const messageData = Buffer.from(message, 'ucs2');

  const data = Buffer.alloc(4 + 1 + 1 + 2 + messageData.length + 1 + 1 + 4);

  let offset = 0;
  offset = data.writeUInt32LE(50000, offset); // number
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
async function performHandshake(messageIterator: AsyncIterator<Message>, outgoingMessageStream: OutgoingMessageStream, tdsVersion?: number[]): Promise<void> {
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

    // The `DONE` token's row count width depends on the TDS version that
    // the `LOGINACK` token in the same message just negotiated.
    const use64BitRowCount = tdsVersion === undefined || tdsVersion[0] >= 0x72;

    const responseMessage = new Message({ type: 0x04 });
    responseMessage.end(Buffer.concat([buildLoginAckToken(tdsVersion), buildDoneToken(undefined, use64BitRowCount)]));
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

  it('throws a `TypeError` without starting a bulk load when its `signal` option is invalid', function() {
    const connection = new Connection({
      server: (server.address() as net.AddressInfo).address,
      options: {
        port: (server.address() as net.AddressInfo).port,
        encrypt: false
      }
    });

    const bulkLoad = connection.newBulkLoad('#tmp', () => {
      assert.fail('expected the bulk load callback to not be called');
    });

    bulkLoad.addColumn('a', TYPES.Int, { nullable: false });

    let rowsConsumed = false;

    assert.throws(() => {
      connection.execBulkLoad(bulkLoad, (function*() {
        rowsConsumed = true;
        yield { a: 1 };
      })(), { signal: 42 as unknown as AbortSignal });
    }, TypeError, 'The "options.signal" property must be an instance of AbortSignal');

    // The bulk load must be left untouched: not marked as started, and
    // the row iterable never consumed.
    assert.strictEqual(bulkLoad.executionStarted, false);
    assert.strictEqual(rowsConsumed, false);
  });

  it('throws a `TypeError` for an invalid `signal` even when parameter validation would fail the request', function(done) {
    const connection = new Connection({
      server: (server.address() as net.AddressInfo).address,
      options: {
        port: (server.address() as net.AddressInfo).port,
        encrypt: false
      }
    });

    const request = new Request('select @p', (err) => {
      done(err ?? new Error('expected the request callback to not be called'));
    });
    request.addParameter('p', TYPES.Int, { not: 'a number' });

    // The invalid signal must win over the invalid parameter: a
    // synchronous `TypeError` instead of an asynchronous `EPARAM`
    // completion.
    assert.throws(() => {
      connection.execSql(request, { signal: {} as AbortSignal });
    }, TypeError, 'The "options.signal" property must be an instance of AbortSignal');

    // The `EPARAM` completion would be delivered on a later tick - give
    // it the chance to (incorrectly) fire before finishing the test.
    setImmediate(() => {
      done();
    });
  });

  it('throws a `TypeError` without putting the request into preparation mode when the `signal` option of `prepare` is invalid', function() {
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
      connection.prepare(request, { signal: {} as AbortSignal });
    }, TypeError, 'The "options.signal" property must be an instance of AbortSignal');

    // The request must be left untouched - in particular, it must not be
    // stuck in preparation mode.
    assert.strictEqual(request.preparing, false);
  });

  it('completes the request with `ECANCEL` when an already-canceled request is executed with an already-aborted signal', function(done) {
    server.on('connection', async (connection) => {
      const debug = new Debug();
      const incomingMessageStream = new IncomingMessageStream(debug);
      const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

      connection.pipe(incomingMessageStream);
      outgoingMessageStream.pipe(connection);

      try {
        const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

        await performHandshake(messageIterator, outgoingMessageStream);

        // SQL Batch (`select 2`) - the canceled request must never reach
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

      const reason = new Error('too late');
      const controller = new AbortController();
      controller.abort(reason);

      const request = new Request('select 1', (err) => {
        // The cancellation happened before the request was executed, so
        // it wins over the already-aborted signal - attaching a signal
        // must not change the outcome of an already-canceled request.
        assert.instanceOf(err, RequestError);
        assert.strictEqual((err as RequestError).code, 'ECANCEL');
        assert.notStrictEqual(err, reason);

        // The connection was not affected: the next request must
        // complete normally.
        const secondRequest = new Request('select 2', (err, rowCount) => {
          assert.isUndefined(err);
          assert.strictEqual(rowCount, 7);

          connection.close();
        });

        connection.execSqlBatch(secondRequest);
      });

      request.cancel();

      connection.execSqlBatch(request, { signal: controller.signal });
    });

    connection.on('end', () => {
      done();
    });
  });

  it('completes the request with the server error when the signal is aborted from within the `errorMessage` event', function(done) {
    // Used by the client side to signal to the server side that the
    // signal was aborted.
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

        // SQL Batch (`select 1`) - the response starts with an `ERROR`
        // token, but the response message is not finished before the
        // abort happens.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);

          const packet = new Packet(0x04);
          packet.packetId(1);
          packet.addData(buildErrorToken('boom'));
          connection.write(packet.buffer);
        }

        // ATTENTION - sent when the client aborted the request from
        // within the `errorMessage` event.
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

      const reason = new Error('aborted on server error');
      const controller = new AbortController();

      const request = new Request('select 1', (err) => {
        // The server error's token arrived before the abort, so it wins
        // over the abort reason.
        assert.instanceOf(err, RequestError);
        assert.strictEqual((err as RequestError).code, 'EREQUEST');
        assert.strictEqual(err!.message, 'boom');
        assert.notStrictEqual(err, reason);

        connection.close();
      });

      // Abort the signal synchronously from within the `errorMessage`
      // event - the server error must already be recorded at this point.
      connection.on('errorMessage', () => {
        controller.abort(reason);
        signalAborted();
      });

      connection.execSqlBatch(request, { signal: controller.signal });
    });

    connection.on('end', () => {
      done();
    });
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

  it('preserves the abort reason of an `Error` created in another realm', function(done) {
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

      // An `Error` from another realm fails an `instanceof Error` check,
      // but must still be recognized as an `Error` reason and passed
      // through unchanged instead of being wrapped in an `EABORT` error.
      const reason = runInNewContext('new Error("cross-realm failure")');
      assert.notInstanceOf(reason, Error);

      const controller = new AbortController();
      controller.abort(reason);

      const request = new Request('select 1', (err) => {
        assert.strictEqual(err, reason);

        connection.close();
      });

      connection.execSqlBatch(request, { signal: controller.signal });
    });

    connection.on('end', () => {
      done();
    });
  });

  it('completes the request with `ECANCEL` when the request was canceled before the signal was aborted', function(done) {
    // Used by the server side to signal to the client side that the
    // request message was fully received.
    let signalRequestReceived!: () => void;
    const requestReceived = new Promise<void>((resolve) => {
      signalRequestReceived = resolve;
    });

    // Used by the client side to signal to the server side that the
    // signal was aborted (after the request was already canceled).
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

        // SQL Batch (`select 1`) - no response is sent before
        // the attention message arrives.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);

          signalRequestReceived();
        }

        // ATTENTION - sent by the manual cancellation. The
        // acknowledgement is withheld until the signal was aborted, so
        // the abort is guaranteed to happen while the cancellation is
        // still waiting for its acknowledgement.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x06);

          await drainMessage(message);

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
        cancelTimeout: 0
      }
    });

    connection.connect((err) => {
      assert.isUndefined(err);

      const reason = new Error('too late');
      const controller = new AbortController();

      const request = new Request('select 1', (err) => {
        // The manual cancellation happened first, so the request
        // completes with the established `ECANCEL` error - attaching a
        // signal must not change the outcome of an earlier cancellation.
        assert.instanceOf(err, RequestError);
        assert.strictEqual((err as RequestError).code, 'ECANCEL');
        assert.notStrictEqual(err, reason);

        connection.close();
      });

      connection.execSqlBatch(request, { signal: controller.signal });

      // Cancel the request once the server received the request message,
      // then abort the signal while the cancellation is waiting for the
      // attention acknowledgement.
      requestReceived.then(() => {
        connection.cancel();

        controller.abort(reason);
        signalAborted();
      });
    });

    connection.on('end', () => {
      done();
    });
  });

  it('does not update the emulated transaction state when a legacy transaction request is aborted', function(done) {
    // With TDS versions below 7.2, transactions are emulated with SQL
    // batches and client-side `transactionDepth`/`inTransaction`
    // bookkeeping. That bookkeeping must only be updated when the
    // statement actually succeeded.
    server.on('connection', async (connection) => {
      const debug = new Debug();
      const incomingMessageStream = new IncomingMessageStream(debug);
      const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

      connection.pipe(incomingMessageStream);
      outgoingMessageStream.pipe(connection);

      try {
        const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

        // Negotiate TDS 7.1, so the transaction methods take the legacy
        // SQL batch path.
        await performHandshake(messageIterator, outgoingMessageStream, [0x71, 0x00, 0x00, 0x01]);

        // SQL Batch (`BEGIN TRAN`) - the successful transaction begin.
        // The aborted transaction requests never reach the server.
        {
          const { value: message } = await messageIterator.next();
          assert.strictEqual(message.type, 0x01);

          await drainMessage(message);

          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end(buildDoneToken(undefined, false));
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

      // An aborted `BEGIN TRAN` must leave the bookkeeping untouched.
      connection.beginTransaction((err) => {
        assert.strictEqual(err, reason);
        assert.strictEqual(connection.transactionDepth, 0);
        assert.strictEqual(connection.inTransaction, false);

        // A successful `BEGIN TRAN` updates it.
        connection.beginTransaction((err) => {
          assert.isUndefined(err);
          assert.strictEqual(connection.transactionDepth, 1);
          assert.strictEqual(connection.inTransaction, true);

          // An aborted `COMMIT TRAN` must leave it untouched as well.
          connection.commitTransaction((err) => {
            assert.strictEqual(err, reason);
            assert.strictEqual(connection.transactionDepth, 1);
            assert.strictEqual(connection.inTransaction, true);

            connection.close();
          }, '', { signal: controller.signal });
        });
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

      let rowsConsumed = false;

      const bulkLoad = connection.newBulkLoad('#tmp', (err) => {
        assert.strictEqual(err, reason);

        // The row iterable of an already-aborted bulk load must never be
        // started - e.g. a resource-owning generator must not be left
        // paused without finalization.
        assert.strictEqual(rowsConsumed, false);

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

      connection.execBulkLoad(bulkLoad, (function*() {
        rowsConsumed = true;
        yield { a: 1 };
      })(), { signal: controller.signal });
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

    let rowsStarted = false;
    let rowsFinalized = false;

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

      // A row generator that produces rows until backpressure suspends it
      // at a `yield`. Aborting during the `insert bulk` statement must
      // tear down the row pipeline and finalize the generator (running
      // its `finally` block) instead of leaving it paused indefinitely.
      connection.execBulkLoad(bulkLoad, (function*() {
        try {
          while (true) {
            rowsStarted = true;
            yield { a: 1 };
          }
        } finally {
          rowsFinalized = true;
        }
      })(), { signal: controller.signal });

      // Abort the bulk load once the server received the `insert bulk`
      // statement, before the bulk load message itself was sent.
      requestReceived.then(() => {
        controller.abort(reason);
      });
    });

    connection.on('end', () => {
      setImmediate(() => {
        // The row pipeline was already running when the abort happened,
        // and must have been torn down and finalized.
        assert.strictEqual(rowsStarted, true);
        assert.strictEqual(rowsFinalized, true);

        done();
      });
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
