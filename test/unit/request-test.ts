import { assert } from 'chai';
import { TYPES } from '../../src/data-type';
import Request from '../../src/request';

describe('Request', function() {
  it('starts out as not being canceled', function() {
    const request = new Request('SELECT 1', () => {});
    assert.strictEqual(request.canceled, false);
  });

  describe('column encryption', function() {
    it('follows the connection by default', function() {
      assert.isUndefined(new Request('SELECT 1', () => {}).columnEncryption);
      assert.isUndefined(new Request('SELECT 1', () => {}, {}).columnEncryption);
    });

    it('can be set per request', function() {
      for (const columnEncryption of ['enabled', 'resultSetOnly', 'disabled'] as const) {
        assert.strictEqual(new Request('SELECT 1', () => {}, { columnEncryption }).columnEncryption, columnEncryption);
      }
    });

    it('rejects invalid settings', function() {
      assert.throws(() => {
        new Request('SELECT 1', () => {}, { columnEncryption: true as any });
      }, TypeError, 'The "options.columnEncryption" property must be one of "enabled", "resultSetOnly" or "disabled".');
    });

    it('can be forced for a parameter', function() {
      const request = new Request('SELECT @a, @b, @c', () => {});
      request.addParameter('a', TYPES.Int, 1, { forceEncrypt: true });
      request.addParameter('b', TYPES.Int, 1, { forceEncrypt: false });
      request.addOutputParameter('c', TYPES.Int, 1, { forceEncrypt: true });

      assert.deepEqual(request.parameters.map((parameter) => parameter.forceEncrypt), [true, undefined, true]);
      assert.isTrue(request.parameters[2].output);
    });
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
});
