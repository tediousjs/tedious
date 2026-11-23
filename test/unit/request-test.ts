import { assert } from 'chai';
import { TYPES } from '../../src/data-type';
import Request from '../../src/request';
import { RequestError } from '../../src/errors';
import { type InternalConnectionOptions } from '../../src/connection';

describe('Request', function() {
  it('starts out as not being canceled', function() {
    const request = new Request('SELECT 1', () => {});
    assert.strictEqual(request.canceled, false);
  });

  describe('#cancel', function() {
    it('marks the request as canceled', function() {
      const request = new Request('', () => {});
      request.cancel();
      assert.strictEqual(request.canceled, true);
    });

    it('emits a `cancel` event', function() {
      const request = new Request('', () => {});

      let eventEmitted = false;
      request.on('cancel', () => { eventEmitted = true; });
      request.cancel();

      assert.strictEqual(eventEmitted, true);
    });

    it('only emits the `cancel` event on the first call', function() {
      const request = new Request('', () => {});
      request.cancel();

      let eventEmitted = false;
      request.on('cancel', () => { eventEmitted = true; });
      request.cancel();

      assert.strictEqual(eventEmitted, false);
    });
  });

  describe('#addOutputParameter', function() {
    it('does not modify the passed in options object', function() {
      const request = new Request('', () => {});

      request.addOutputParameter('foo', TYPES.NVarChar, 'test', Object.freeze({ length: 10 }));
    });
  });

  describe('#addParameter', function() {
    it('does not modify the passed in options object', function() {
      const request = new Request('', () => { });

      request.addParameter('foo', TYPES.NVarChar, 'test', Object.freeze({ length: 10 }));
    });
  });
  describe('#validateParameters', function() {
    const options = { tdsVersion: '7_4', useUTC: true } as InternalConnectionOptions;

    it('accepts json parameter values that are strings of JSON text', function() {
      const request = new Request('SELECT @p', () => {});
      request.addParameter('p', TYPES.JSON, '{"a":1}');
      request.validateParameters(undefined, options);
      assert.deepEqual(request.parameters[0].value, Buffer.from('{"a":1}', 'utf8'));
    });

    for (const [description, value] of [
      ['objects', { a: 1 }],
      ['arrays', [1, 2]],
      ['numbers', 1],
      ['booleans', false],
      ['`Buffer`s', Buffer.from('{}')]
    ] as const) {
      it(`fails json parameter values that are ${description} with an \`EPARAM\` error`, function() {
        const request = new Request('SELECT @p', () => {});
        request.addParameter('p', TYPES.JSON, value);

        let error: unknown;
        try {
          request.validateParameters(undefined, options);
        } catch (err) {
          error = err;
        }

        assert.instanceOf(error, RequestError);
        assert.strictEqual((error as RequestError).code, 'EPARAM');
        assert.strictEqual((error as RequestError).message, "Validation failed for parameter 'p'. Invalid JSON value: expected a string of JSON text.");
        assert.instanceOf((error as RequestError).cause, TypeError);
      });
    }
  });
});
