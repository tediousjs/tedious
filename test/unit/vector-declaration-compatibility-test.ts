import { assert } from 'chai';
import { getEventListeners } from 'events';

import { Connection, Request, RequestError, TYPES } from '../../src/tedious';
import { abortOnSignal } from '../../src/execution-options';

describe('VECTOR declaration compatibility', function() {
  for (const method of ['execSql', 'prepare'] as const) {
    for (const alreadyAborted of [false, true]) {
      it(`${method} preserves synchronous null-TVP errors with ${alreadyAborted ? 'an aborted' : 'an active'} signal`, async function() {
        const connection = new Connection({ server: 'localhost', options: { vectorTypeSupport: 'off' } });
        const controller = new AbortController();
        if (alreadyAborted) {
          controller.abort();
        }
        let callbackCount = 0;
        const request = new Request('SELECT 1', () => { callbackCount++; });
        request.addParameter('tvp', TYPES.TVP, null);
        const callback = request.callback;

        assert.throws(() => connection[method](request, { signal: controller.signal }), TypeError);
        await new Promise<void>((resolve) => setImmediate(resolve));
        assert.strictEqual(callbackCount, 0);
        assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);
        assert.strictEqual(request.callback, callback);
        assert.isFalse(request.canceled);
      });
    }
  }

  it('propagates even an EPARAM thrown by a non-VECTOR declaration unchanged', function() {
    const connection = new Connection({ server: 'localhost' });
    const failure = new RequestError('custom declaration failed', 'EPARAM');
    const type = { ...TYPES.Int, declaration: () => { throw failure; } };
    const request = new Request('SELECT 1', () => assert.fail('unexpected callback'));
    request.addParameter('custom', type, 1);
    request.addParameter('v', TYPES.Vector);

    assert.throws(() => connection.prepare(request), failure);
  });

  it('does not reject malformed non-VECTOR TVP columns during vector checks', function() {
    const connection = new Connection({ server: 'localhost', options: { vectorTypeSupport: 'off' } });
    let callbackError: Error | null | undefined;
    const request = new Request('procedure', (error) => { callbackError = error; });
    request.addParameter('tvp', TYPES.TVP, { columns: [null], rows: [] });

    assert.doesNotThrow(() => connection.callProcedure(request));
    assert.instanceOf(callbackError, RequestError);
    assert.strictEqual((callbackError as RequestError).code, 'EINVALIDSTATE');
  });

  it('reports the first failing declaration when VECTOR precedes another type', async function() {
    const connection = new Connection({ server: 'localhost' });
    let laterDeclarationCalled = false;
    const type = { ...TYPES.Int, declaration: () => { laterDeclarationCalled = true; throw new Error('later failure'); } };
    let request!: Request;
    const completed = new Promise<Error | null | undefined>((resolve) => {
      request = new Request('SELECT 1', resolve);
    });
    request.addParameter('v', TYPES.Vector);
    request.addParameter('custom', type, 1);

    connection.prepare(request);
    const error = await completed;
    assert.instanceOf(error, RequestError);
    assert.strictEqual((error as RequestError).constructor, RequestError);
    assert.strictEqual((error as RequestError).code, 'EPARAM');
    assert.isFalse(laterDeclarationCalled);
  });

  for (const alreadyAborted of [false, true]) {
    it(`reports a VECTOR declaration error asynchronously with ${alreadyAborted ? 'an aborted' : 'an active'} signal`, async function() {
      const connection = new Connection({ server: 'localhost' });
      const controller = new AbortController();
      if (alreadyAborted) {
        controller.abort();
      }
      let callbackCount = 0;
      let synchronous = true;
      let request!: Request;
      const completed = new Promise<Error | null | undefined>((resolve) => {
        request = new Request('SELECT @v', (error) => {
          assert.isFalse(synchronous);
          callbackCount++;
          resolve(error);
        });
      });
      request.addParameter('v', TYPES.Vector);
      const callback = request.callback;
      assert.doesNotThrow(() => connection.prepare(request, { signal: controller.signal }));
      synchronous = false;
      const error = await completed;
      assert.instanceOf(error, RequestError);
      assert.strictEqual((error as RequestError).code, 'EPARAM');
      assert.include((error as RequestError).message, 'Validation failed for parameter \'v\'.');
      assert.instanceOf((error as RequestError).cause, TypeError);
      assert.strictEqual(callbackCount, 1);
      assert.strictEqual(request.callback, callback);
      assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);
      assert.isFalse(request.canceled);
    });
  }

  it('keeps an in-progress execution signal listener when a second prepare fails', async function() {
    const connection = new Connection({ server: 'localhost' });
    const controller = new AbortController();
    let request!: Request;
    const completed = new Promise<Error | null | undefined>((resolve) => {
      request = new Request('SELECT @v', resolve);
    });
    request.addParameter('v', TYPES.Vector);
    abortOnSignal(request, controller.signal);
    const activeCallback = request.callback;

    connection.prepare(request, { signal: AbortSignal.abort() });
    assert.instanceOf(await completed, RequestError);
    assert.strictEqual(request.callback, activeCallback);
    assert.lengthOf(getEventListeners(controller.signal, 'abort'), 1);
    assert.isFalse(request.canceled);

    request.callback(undefined);
    assert.lengthOf(getEventListeners(controller.signal, 'abort'), 0);
  });
});
