import { assert } from 'chai';
import { getEventListeners } from 'events';
import * as net from 'net';

import { Connection, Request, RequestError, TYPES } from '../../src/tedious';
import { abortOnSignal } from '../../src/execution-options';
import IncomingMessageStream from '../../src/incoming-message-stream';
import OutgoingMessageStream from '../../src/outgoing-message-stream';
import Debug from '../../src/debug';
import PreloginPayload from '../../src/prelogin-payload';
import Message from '../../src/message';

// Assert that an execution failed because its abort signal was aborted with
// the given reason.
function assertAbortError(error: unknown, reason: unknown) {
  assert.instanceOf(error, RequestError);
  assert.strictEqual((error as RequestError).code, 'ABORT_ERR');
  assert.strictEqual((error as RequestError).name, 'AbortError');
  assert.strictEqual((error as RequestError).message, 'The operation was aborted');
  assert.strictEqual((error as RequestError).cause, reason);
}

describe('abortOnSignal', function() {
  // A stand-in for a request or bulk load, which completes with a
  // cancellation error once it is canceled, like a real one does.
  function execution() {
    let resolve!: (error: Error | null | undefined) => void;
    const completed = new Promise<Error | null | undefined>((r) => {
      resolve = r;
    });

    const execution = {
      canceled: false,
      cancelCalls: 0,
      callback(error: Error | null | undefined) {
        resolve(error);
      },
      cancel() {
        this.cancelCalls += 1;
        this.canceled = true;
        process.nextTick(() => {
          this.callback(new RequestError('Canceled.', 'ECANCEL'));
        });
      }
    };

    return { execution, completed };
  }

  for (const reason of [new Error('no longer needed'), 'no longer needed', null, undefined, 0, false, '']) {
    it(`fails with an abort error caused by the reason, if it is ${reason === '' ? 'an empty string' : String(reason)}`, async function() {
      const { execution: exec, completed } = execution();
      const controller = new AbortController();

      abortOnSignal(exec, controller.signal);
      controller.abort(reason);

      const error = await completed;
      assert.strictEqual(exec.cancelCalls, 1);

      if (reason === undefined) {
        // `abort()` without a reason aborts with a `DOMException`.
        assertAbortError(error, controller.signal.reason);
        assert.strictEqual((controller.signal.reason as DOMException).name, 'AbortError');
      } else {
        assertAbortError(error, reason);
      }
    });
  }

  it('cancels right away if the signal is aborted already', async function() {
    const { execution: exec, completed } = execution();
    const reason = new Error('aborted before');

    abortOnSignal(exec, AbortSignal.abort(reason));
    assert.strictEqual(exec.cancelCalls, 1);

    assertAbortError(await completed, reason);
  });

  it('keeps the cancellation error if the execution was canceled before the signal was aborted', async function() {
    const { execution: exec, completed } = execution();
    const controller = new AbortController();

    abortOnSignal(exec, controller.signal);
    exec.cancel();
    controller.abort(new Error('too late'));

    const error = await completed;
    assert.instanceOf(error, RequestError);
    assert.strictEqual((error as RequestError).code, 'ECANCEL');
    assert.strictEqual(exec.cancelCalls, 1);
  });

  it('keeps errors other than the cancellation error', async function() {
    const { execution: exec, completed } = execution();
    const controller = new AbortController();
    const timeoutError = new RequestError('Timeout: Request failed to complete in 15000ms', 'ETIMEOUT');

    abortOnSignal(exec, controller.signal);
    controller.abort();
    exec.callback(timeoutError);

    assert.strictEqual(await completed, timeoutError);
  });

  it('removes its listener and restores the callback once the execution completed', async function() {
    const { execution: exec, completed } = execution();
    const controller = new AbortController();
    const callback = exec.callback;

    abortOnSignal(exec, controller.signal);
    assert.lengthOf(getEventListeners(controller.signal, 'abort'), 1);

    exec.callback(undefined);
    assert.isUndefined(await completed);

    assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);
    assert.strictEqual(exec.callback, callback);

    controller.abort();
    assert.strictEqual(exec.cancelCalls, 0);
  });
});

describe('Executing a request with an abort signal', function() {
  describe('when the execution is not started', function() {
    let connection: Connection;

    beforeEach(function() {
      // A connection that is not connected rejects every request.
      connection = new Connection({ server: 'localhost' });
    });

    // A request whose parameters cannot be serialized, which makes `execSql`
    // and `prepare` throw synchronously.
    function unserializableRequest(callback: (error: Error | null | undefined) => void) {
      const request = new Request('SELECT 1', callback);
      request.addParameter('tvp', TYPES.TVP, null);
      return request;
    }

    for (const method of ['execSql', 'prepare'] as const) {
      it(`does not listen to the signal if \`${method}\` throws`, function() {
        const request = unserializableRequest(() => {
          assert.fail('the request must not call back');
        });
        const callback = request.callback;
        const controller = new AbortController();

        assert.throws(() => {
          connection[method](request, { signal: controller.signal });
        }, TypeError);

        assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);
        assert.strictEqual(request.callback, callback);
      });

      it(`does not cancel the request if \`${method}\` throws, and its signal was aborted already`, function() {
        const request = unserializableRequest(() => {
          assert.fail('the request must not call back');
        });
        const callback = request.callback;

        assert.throws(() => {
          connection[method](request, { signal: AbortSignal.abort(new Error('aborted before')) });
        }, TypeError);

        assert.isFalse(request.canceled);
        assert.strictEqual(request.callback, callback);
      });
    }

    it('fails a request that is rejected with the rejection, not the abort error, and does not cancel it', function() {
      const errors: Array<Error | null | undefined> = [];
      const request = new Request('SELECT 1', (error) => {
        errors.push(error);
      });

      connection.execSql(request, { signal: AbortSignal.abort(new Error('aborted before')) });

      assert.lengthOf(errors, 1);
      assert.instanceOf(errors[0], RequestError);
      assert.strictEqual((errors[0] as RequestError).code, 'EINVALIDSTATE');
      assert.isFalse(request.canceled);
    });

    it('does not listen to the signal of a request that is rejected', function() {
      const request = new Request('SELECT 1', () => {});
      const controller = new AbortController();

      connection.execSqlBatch(request, { signal: controller.signal });

      assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);
    });
  });

  describe('when the request times out after the signal was aborted', function() {
    let server: net.Server;
    let sockets: net.Socket[];

    beforeEach(function(done) {
      sockets = [];
      server = net.createServer((socket) => {
        sockets.push(socket);
      });
      server.listen(0, '127.0.0.1', done);
    });

    afterEach(function(done) {
      sockets.forEach((socket) => {
        socket.destroy();
      });

      server.close(done);
    });

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

    function buildDoneToken(status: number): Buffer {
      const buffer = Buffer.alloc(13);

      let offset = 0;
      offset = buffer.writeUInt8(0xFD, offset); // DONE
      offset = buffer.writeUInt16LE(status, offset); // status
      offset = buffer.writeUInt16LE(0x0000, offset); // curCmd
      buffer.writeBigUInt64LE(0n, offset); // rowCount

      return buffer;
    }

    async function drainMessage(message: Message): Promise<void> {
      const iterator = message[Symbol.asyncIterator]();
      while (!(await iterator.next()).done) {
        // Discard the data.
      }
    }

    it('fails with the abort error, not with a timeout error', function(done) {
      const requestTimeout = 200;
      const controller = new AbortController();
      const reason = new Error('no longer needed');

      server.on('connection', async (socket) => {
        const debug = new Debug();
        const incomingMessageStream = new IncomingMessageStream(debug);
        const outgoingMessageStream = new OutgoingMessageStream(debug, { packetSize: 4 * 1024 });

        socket.pipe(incomingMessageStream);
        outgoingMessageStream.pipe(socket);

        try {
          const messageIterator = incomingMessageStream[Symbol.asyncIterator]();

          const expectMessage = async (type: number) => {
            const { value: message, done } = await messageIterator.next();
            assert.isNotOk(done);
            assert.strictEqual(message.type, type);
            await drainMessage(message);
          };

          const respond = (data?: Buffer) => {
            const responseMessage = new Message({ type: 0x04 });
            responseMessage.end(data);
            outgoingMessageStream.write(responseMessage);
          };

          // PRELOGIN
          await expectMessage(0x12);
          {
            const responsePayload = new PreloginPayload({ encrypt: false, version: { major: 1, minor: 2, build: 3, subbuild: 0 } });
            const responseMessage = new Message({ type: 0x12 });
            responseMessage.end(responsePayload.data);
            outgoingMessageStream.write(responseMessage);
          }

          // LOGIN7
          await expectMessage(0x10);
          respond(Buffer.concat([buildLoginAckToken(), buildDoneToken(0x0000)]));

          // SQL Batch (Initial SQL)
          await expectMessage(0x01);
          respond();

          // SQL Batch (`select 1`). The request message was received in full,
          // so aborting now sends an attention message.
          await expectMessage(0x01);
          controller.abort(reason);

          // ATTENTION
          await expectMessage(0x06);

          // Let the request time out before the server responds to the
          // canceled request and acknowledges the attention message.
          setTimeout(() => {
            respond(buildDoneToken(0x0000));
            respond(buildDoneToken(0x0020)); // DONE_ATTN
          }, requestTimeout * 2);
        } catch (err: any) {
          done(err);
        }
      });

      const connection = new Connection({
        server: (server.address() as net.AddressInfo).address,
        options: {
          port: (server.address() as net.AddressInfo).port,
          encrypt: false,
          requestTimeout: requestTimeout
        }
      });

      connection.connect((err) => {
        if (err) {
          return done(err);
        }

        const request = new Request('select 1', (error) => {
          try {
            assertAbortError(error, reason);
          } catch (assertionError) {
            failure = assertionError as Error;
          }

          connection.close();
        });

        connection.execSqlBatch(request, { signal: controller.signal });
      });

      let failure: Error | undefined;
      connection.on('end', () => {
        done(failure);
      });
    });
  });
});
