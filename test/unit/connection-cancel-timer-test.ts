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

// Consume and discard a message's data so the iterator can advance to the
// next incoming message.
async function drainMessage(message: AsyncIterable<Buffer>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _ of message) {
    // Discard each chunk.
  }
}

// Read the next message the client sends, assert its TDS packet type, and drain
// its payload. Guards against the message stream ending unexpectedly, so a
// premature end surfaces as a clear assertion failure rather than a `TypeError`
// on `message.type`.
async function expectMessage(iterator: AsyncIterableIterator<Message>, expectedType: number): Promise<void> {
  const { value: message, done } = await iterator.next();
  assert.isNotOk(done, 'expected another message from the client, but the stream ended');
  assert.isDefined(message, 'expected a message from the client, but received none');
  assert.strictEqual(message.type, expectedType);
  await drainMessage(message);
}

describe('Connection cancel timer handling', function() {
  let server: net.Server;
  let serverConnections: net.Socket[];

  beforeEach(function(done) {
    serverConnections = [];
    server = net.createServer();
    server.listen(0, '127.0.0.1', done);
  });

  afterEach(function(done) {
    serverConnections.forEach((connection) => {
      connection.destroy();
    });

    server.close(done);
  });

  // Regression test for a leaked cancel timer.
  //
  // When a request is canceled after its request message was fully sent, an
  // attention message is sent to the server and a cancel timer is armed as a
  // watchdog. If the connection is then torn down (e.g. via `close`) before the
  // server's attention acknowledgement arrives, `cleanupConnection` used to
  // clear the request timer but not the cancel timer. The orphaned cancel timer
  // would later fire in the `Final` state, where `dispatchEvent('socketError')`
  // has no handler and therefore emits a spurious `error` event - long after the
  // connection has already emitted `end`.
  it('does not emit a spurious cancel-timeout error when closed while a cancel is in flight', function(done) {
    const cancelTimeout = 300;

    // The time `connection.close()` was called, and the delays (relative to it)
    // at which `error` events were observed on the client connection.
    let closeTime: number | undefined;
    const errorDelays: number[] = [];

    // The error the in-flight request completed with.
    let requestError: (Error & { code?: string }) | null | undefined;

    let finished = false;
    const finish = (err?: Error) => {
      if (finished) {
        return;
      }
      finished = true;
      done(err);
    };

    server.on('connection', async (socket) => {
      serverConnections.push(socket);

      // The client closes its socket abruptly as part of this test, which
      // surfaces as an `ECONNRESET` on the server socket. Swallow it so it
      // does not bubble up as an unhandled error.
      socket.on('error', () => { /* ignore */ });

      const debug = new Debug();
      const incomingMessageStream = new IncomingMessageStream(debug);
      const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

      socket.pipe(incomingMessageStream);
      outgoingMessageStream.pipe(socket);

      const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

      try {
        // PRELOGIN
        await expectMessage(messageIterator, 0x12);
        {
          const responsePayload = new PreloginPayload({ encrypt: false, version: { major: 1, minor: 2, build: 3, subbuild: 0 } });
          const responseMessage = new Message({ type: 0x12 });
          responseMessage.end(responsePayload.data);
          outgoingMessageStream.write(responseMessage);
        }

        // LOGIN7
        await expectMessage(messageIterator, 0x10);
        {
          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end(buildLoginAckToken());
          outgoingMessageStream.write(responseMessage);
        }

        // SQL Batch (Initial SQL)
        await expectMessage(messageIterator, 0x01);
        {
          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end();
          outgoingMessageStream.write(responseMessage);
        }

        // The client is now logged in and will issue a request. Reading the
        // request message in full means the client finished sending it, so the
        // "cancel after request sent" path (which sends an attention message and
        // arms the cancel timer) is now wired up.
        await expectMessage(messageIterator, 0x03); // RPC_REQUEST

        // Cancel the in-flight request from the client side. This sends an
        // attention message to the server and arms the cancel timer.
        connection.cancel();

        // Read the attention message the client sends. Once we have it, we know
        // the cancel timer has been armed on the client.
        await expectMessage(messageIterator, 0x06); // ATTENTION

        // Send the (cut short) response to the canceled request so the client
        // moves into its `SentAttention` state, waiting for the attention
        // acknowledgement...
        {
          const responseMessage = new Message({ type: 0x04 });
          responseMessage.end();
          outgoingMessageStream.write(responseMessage);
        }

        // ...but never send the acknowledgement. Instead, close the connection
        // while the cancel is still in flight and the cancel timer is armed.
        setImmediate(() => {
          closeTime = Date.now();
          connection.close();
        });

        // Give the (leaked) cancel timer well over `cancelTimeout` to fire.
        //
        // Tearing down a connection that is waiting on a response may surface an
        // immediate "connection lost" socket error, so we cannot simply assert
        // that no `error` is emitted. Instead we rely on timing: any error
        // caused by the teardown itself arrives within a few milliseconds of
        // `close()`, whereas the orphaned cancel timer only fires roughly
        // `cancelTimeout` later. With a `cancelTimeout` of 300ms, an error
        // observed 150ms or more after `close()` is comfortably separated from
        // teardown noise and can only have come from the leaked timer.
        setTimeout(() => {
          try {
            const lateError = errorDelays.some((delay) => delay >= cancelTimeout / 2);
            assert.isFalse(lateError, 'a spurious error was emitted ~' + cancelTimeout + 'ms after the connection was closed (leaked cancel timer)');
            assert.strictEqual(requestError?.code, 'ECLOSE', 'the in-flight request should complete with an ECLOSE error');
            finish();
          } catch (assertionError) {
            finish(assertionError as Error);
          }
        }, cancelTimeout + 150);
      } catch (err) {
        finish(err as Error);
      }
    });

    const connection = new Connection({
      server: (server.address() as net.AddressInfo).address,
      options: {
        port: (server.address() as net.AddressInfo).port,
        encrypt: false,
        cancelTimeout: cancelTimeout
      }
    });

    // Record when (relative to `close()`) each `error` event arrives. Errors
    // emitted before `close()` are not relevant to this test.
    connection.on('error', () => {
      if (closeTime !== undefined) {
        errorDelays.push(Date.now() - closeTime);
      }
    });

    connection.connect((err) => {
      if (err) {
        return finish(err);
      }

      const request = new Request('SELECT 1', (reqErr) => {
        requestError = reqErr as (Error & { code?: string }) | null | undefined;
      });

      connection.execSql(request);
    });
  });
});
