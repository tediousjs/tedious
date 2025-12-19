import { assert } from 'chai';
import { TYPES } from '../../src/data-type';
import Request from '../../src/request';

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
});
