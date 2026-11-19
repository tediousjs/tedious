import { assert } from 'chai';
import { getEventListeners } from 'events';
import * as net from 'net';

import { Connection, Request, RequestError, TYPES } from '../../src/tedious';
import { Cancellation } from '../../src/execution-options';
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

describe('Cancellation', function() {
  function cancellation() {
    const result = { cancellation: undefined as unknown as Cancellation, cancelCalls: 0 };
    result.cancellation = new Cancellation(() => {
      result.cancelCalls += 1;
    });
    return result;
  }

  it('starts out as not being canceled', function() {
    const { cancellation: c, cancelCalls } = cancellation();

    assert.isFalse(c.canceled);
    assert.isFalse(c.signal.aborted);
    assert.isUndefined(c.error);
    assert.strictEqual(cancelCalls, 0);
  });

  it('aborts its signal with the error it is canceled with', function() {
    const state = cancellation();
    const error = new RequestError('Canceled.', 'ECANCEL');

    state.cancellation.cancel(error);

    assert.isTrue(state.cancellation.canceled);
    assert.strictEqual(state.cancellation.signal.reason, error);
    assert.strictEqual(state.cancellation.error, error);
    assert.strictEqual(state.cancelCalls, 1);
  });

  it('keeps the error of the first cancellation', function() {
    const state = cancellation();
    const timeoutError = new RequestError('Timeout: Request failed to complete in 15000ms', 'ETIMEOUT');

    state.cancellation.cancel(timeoutError);
    state.cancellation.cancel(new RequestError('Canceled.', 'ECANCEL'));

    assert.strictEqual(state.cancellation.error, timeoutError);
    assert.strictEqual(state.cancelCalls, 1);
  });

  for (const reason of [new Error('no longer needed'), 'no longer needed', null, undefined, 0, false, '']) {
    it(`is canceled with an abort error caused by the reason of a followed signal, if it is ${reason === '' ? 'an empty string' : String(reason)}`, function() {
      const state = cancellation();
      const controller = new AbortController();

      state.cancellation.follow(controller.signal);
      assert.isFalse(state.cancellation.canceled);

      controller.abort(reason);

      assert.isTrue(state.cancellation.canceled);
      assert.strictEqual(state.cancelCalls, 1);

      if (reason === undefined) {
        // `abort()` without a reason aborts with a `DOMException`.
        assertAbortError(state.cancellation.error, controller.signal.reason);
        assert.strictEqual((controller.signal.reason as DOMException).name, 'AbortError');
      } else {
        assertAbortError(state.cancellation.error, reason);
      }
    });
  }

  it('is canceled right away if a followed signal is aborted already', function() {
    const state = cancellation();
    const reason = new Error('aborted before');

    state.cancellation.follow(AbortSignal.abort(reason));

    assert.strictEqual(state.cancelCalls, 1);
    assertAbortError(state.cancellation.error, reason);
  });

  it('keeps the error of an earlier cancellation if a followed signal is aborted', function() {
    const state = cancellation();
    const controller = new AbortController();
    const error = new RequestError('Canceled.', 'ECANCEL');

    state.cancellation.follow(controller.signal);
    state.cancellation.cancel(error);
    controller.abort(new Error('too late'));

    assert.strictEqual(state.cancellation.error, error);
    assert.strictEqual(state.cancelCalls, 1);
  });

  it('stops following signals and resets once the execution completed', function() {
    const state = cancellation();
    const controller = new AbortController();

    state.cancellation.follow(controller.signal);
    assert.lengthOf(getEventListeners(controller.signal, 'abort'), 1);

    state.cancellation.complete();
    assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);

    controller.abort();
    assert.isFalse(state.cancellation.canceled);
    assert.strictEqual(state.cancelCalls, 0);
  });

  it('resets a canceled execution once it completed', function() {
    const state = cancellation();

    state.cancellation.cancel(new RequestError('Canceled.', 'ECANCEL'));
    const signal = state.cancellation.signal;

    state.cancellation.complete();

    assert.isFalse(state.cancellation.canceled);
    assert.isUndefined(state.cancellation.error);
    assert.notStrictEqual(state.cancellation.signal, signal);
    assert.isFalse(state.cancellation.signal.aborted);
  });

  it('removes the listeners scoped to an execution once it completed, without calling them', function() {
    const state = cancellation();
    const { signal, completed } = state.cancellation;

    let calls = 0;
    signal.addEventListener('abort', () => {
      calls += 1;
    }, { signal: completed });

    state.cancellation.complete();

    assert.isTrue(completed.aborted);
    assert.isFalse(signal.aborted);
    assert.lengthOf(getEventListeners(signal, 'abort'), 0);
    assert.strictEqual(calls, 0);
    assert.isFalse(state.cancellation.completed.aborted);
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

    it('fails a bulk load that is rejected with the rejection, and neither cancels it nor listens to its signal', function() {
      const errors: Array<Error | null | undefined> = [];
      const bulkLoad = connection.newBulkLoad('#bulk', (error) => {
        errors.push(error);
      });
      bulkLoad.addColumn('id', TYPES.Int, { nullable: false });
      const callback = bulkLoad.callback;
      const signal = AbortSignal.abort(new Error('aborted before'));

      connection.execBulkLoad(bulkLoad, [{ id: 1 }], { signal });

      assert.lengthOf(errors, 1);
      assert.instanceOf(errors[0], RequestError);
      assert.strictEqual((errors[0] as RequestError).code, 'EINVALIDSTATE');
      assert.isFalse(bulkLoad.canceled);
      assert.strictEqual(bulkLoad.callback, callback);
    });

    it('does not listen to the signal of a bulk load that is rejected', function() {
      const bulkLoad = connection.newBulkLoad('#bulk', () => {});
      bulkLoad.addColumn('id', TYPES.Int, { nullable: false });
      const controller = new AbortController();

      connection.execBulkLoad(bulkLoad, [{ id: 1 }], { signal: controller.signal });

      assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);
    });

    it('does not listen to the signal of a request that is rejected', function() {
      const request = new Request('SELECT 1', () => {});
      const controller = new AbortController();

      connection.execSqlBatch(request, { signal: controller.signal });

      assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);
    });
  });

  describe('against a mock TDS server', function() {
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

    interface MockSession {
      // Wait for the next message from the client, which must be of the
      // given type.
      expectMessage(type: number): Promise<void>;
      // Send a response message with the given tokens.
      respond(data?: Buffer): void;
    }

    // Accept a connection, log it in, and then hand the session to the test.
    function serve(handler: (session: MockSession) => Promise<void>, done: (err?: any) => void) {
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

          await handler({ expectMessage, respond });
        } catch (err: any) {
          done(err);
        }
      });
    }

    function connect(options: { requestTimeout?: number } = {}) {
      return new Connection({
        server: (server.address() as net.AddressInfo).address,
        options: {
          port: (server.address() as net.AddressInfo).port,
          encrypt: false,
          ...options
        }
      });
    }

    it('fails with the abort error, not with a timeout error, when the request times out after the signal was aborted', function(done) {
      const requestTimeout = 200;
      const controller = new AbortController();
      const reason = new Error('no longer needed');

      serve(async ({ expectMessage, respond }) => {
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
      }, done);

      const connection = connect({ requestTimeout });

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

    it('fails a canceled request with the cancellation error, not with a timeout error, when it times out before the cancellation is acknowledged', function(done) {
      const requestTimeout = 200;
      let request!: Request;

      serve(async ({ expectMessage, respond }) => {
        await expectMessage(0x01);
        request.cancel();

        // ATTENTION
        await expectMessage(0x06);

        setTimeout(() => {
          respond(buildDoneToken(0x0000));
          respond(buildDoneToken(0x0020)); // DONE_ATTN
        }, requestTimeout * 2);
      }, done);

      const connection = connect({ requestTimeout });

      connection.connect((err) => {
        if (err) {
          return done(err);
        }

        request = new Request('select 1', (error) => {
          try {
            assert.instanceOf(error, RequestError);
            assert.strictEqual((error as RequestError).code, 'ECANCEL');
          } catch (assertionError) {
            failure = assertionError as Error;
          }

          connection.close();
        });

        connection.execSqlBatch(request);
      });

      let failure: Error | undefined;
      connection.on('end', () => {
        done(failure);
      });
    });

    it('fails a request that times out with the timeout error, once the server acknowledged the attention message', function(done) {
      const requestTimeout = 100;

      serve(async ({ expectMessage, respond }) => {
        // SQL Batch (`select 1`), which the server does not respond to
        // before the request times out.
        await expectMessage(0x01);

        // ATTENTION, sent once the request timed out.
        await expectMessage(0x06);
        respond(buildDoneToken(0x0000));
        respond(buildDoneToken(0x0020)); // DONE_ATTN
      }, done);

      const connection = connect({ requestTimeout });

      connection.connect((err) => {
        if (err) {
          return done(err);
        }

        const request = new Request('select 1', (error) => {
          try {
            assert.instanceOf(error, RequestError);
            assert.strictEqual((error as RequestError).code, 'ETIMEOUT');
            assert.strictEqual((error as RequestError).message, `Timeout: Request failed to complete in ${requestTimeout}ms`);
            assert.isFalse(request.canceled, 'the timeout must not cancel the next execution');
          } catch (assertionError) {
            failure = assertionError as Error;
          }

          connection.close();
        });

        connection.execSqlBatch(request);
      });

      let failure: Error | undefined;
      connection.on('end', () => {
        done(failure);
      });
    });

    it('stops listening to the signal when the connection is closed during the execution', function(done) {
      const controller = new AbortController();
      let connection!: Connection;

      serve(async ({ expectMessage }) => {
        await expectMessage(0x01);

        try {
          assert.lengthOf(getEventListeners(controller.signal, 'abort'), 1);
        } catch (err) {
          return done(err);
        }

        connection.close();
      }, done);

      connection = connect();

      connection.connect((err) => {
        if (err) {
          return done(err);
        }

        const request = new Request('select 1', (error) => {
          try {
            assert.instanceOf(error, RequestError);
            assert.strictEqual((error as RequestError).code, 'ECLOSE');
            assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);

            // The execution completed, so aborting the signal now has no
            // effect - in particular, no attention message is written to
            // the closed connection.
            controller.abort();
            assert.isFalse(request.canceled);
          } catch (assertionError) {
            failure = assertionError as Error;
          }
        });

        connection.execSqlBatch(request, { signal: controller.signal });
      });

      let failure: Error | undefined;
      connection.on('end', () => {
        // `end` is emitted on the next tick after the request completed.
        setImmediate(() => {
          done(failure);
        });
      });
    });

    // Execute the request again while it is in progress, in a way that is
    // rejected, and check that the execution in progress is still canceled
    // by its own signal, and still fails with the abort error.
    const rejections: Array<{ title: string, sql: string, execute: (connection: Connection, request: Request) => void, rejectedWith: (error: unknown) => void }> = [
      {
        title: 'because another execution is in progress',
        sql: 'select 1',
        execute: (connection, request) => {
          connection.execSqlBatch(request, { signal: AbortSignal.abort(new Error('second execution')) });
        },
        rejectedWith: (error) => {
          assert.instanceOf(error, RequestError);
          assert.strictEqual((error as RequestError).code, 'EINVALIDSTATE');
        }
      },
      {
        title: 'because its parameters fail validation',
        sql: 'select @a',
        execute: (connection, request) => {
          request.parameters[0].value = 'not a number';
          connection.execSql(request, { signal: AbortSignal.abort(new Error('second execution')) });
        },
        rejectedWith: (error) => {
          assert.instanceOf(error, Error);
          assert.match((error as Error).message, /^Validation failed for parameter 'a'/);
        }
      }
    ];

    for (const rejection of rejections) {
      it(`keeps listening to the signal of an execution in progress if executing the request again is rejected ${rejection.title}`, function(done) {
        const controller = new AbortController();
        const reason = new Error('no longer needed');
        const errors: Array<Error | null | undefined> = [];
        let connection!: Connection;
        let request!: Request;

        serve(async ({ expectMessage, respond }) => {
          // The first execution: a SQL batch, or an RPC request for
          // `execSql`.
          await expectMessage(rejection.sql === 'select 1' ? 0x01 : 0x03);

          rejection.execute(connection, request);

          // Rejections because of the parameters are reported on the next
          // tick.
          await new Promise((resolve) => setImmediate(resolve));

          try {
            assert.lengthOf(errors, 1);
            rejection.rejectedWith(errors[0]);
            assert.isFalse(request.canceled, 'the rejected execution canceled the one in progress');
            assert.lengthOf(getEventListeners(controller.signal, 'abort'), 1, 'the rejected execution removed the signal listener of the one in progress');
          } catch (err) {
            return done(err);
          }

          controller.abort(reason);

          // ATTENTION
          await expectMessage(0x06);
          respond(buildDoneToken(0x0000));
          respond(buildDoneToken(0x0020)); // DONE_ATTN
        }, done);

        connection = connect();

        connection.connect((err) => {
          if (err) {
            return done(err);
          }

          request = new Request(rejection.sql, (error) => {
            errors.push(error);

            if (errors.length === 2) {
              try {
                assertAbortError(errors[1], reason);
                assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);
              } catch (assertionError) {
                failure = assertionError as Error;
              }

              connection.close();
            }
          });

          if (rejection.sql === 'select 1') {
            connection.execSqlBatch(request, { signal: controller.signal });
          } else {
            request.addParameter('a', TYPES.Int, 1);
            connection.execSql(request, { signal: controller.signal });
          }
        });

        let failure: Error | undefined;
        connection.on('end', () => {
          done(failure);
        });
      });
    }
  });
});
