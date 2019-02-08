const { assert } = require('chai');

const Request = require('../../src/request');

describe('Request', function() {
  it('starts out as not being canceled', function() {
    const request = new Request('SELECT 1');
    assert.strictEqual(request.canceled, false);
  });

  describe('#cancel', function() {
    it('marks the request as canceled', function() {
      const request = new Request();
      request.cancel();
      assert.strictEqual(request.canceled, true);
    });

    it('emits a `cancel` event', function() {
      const request = new Request();

      let eventEmitted = false;
      request.on('cancel', () => { eventEmitted = true; });
      request.cancel();

      assert.strictEqual(eventEmitted, true);
    });

    it('only emits the `cancel` event on the first call', function() {
      const request = new Request();
      request.cancel();

      let eventEmitted = false;
      request.on('cancel', () => { eventEmitted = true; });
      request.cancel();

      assert.strictEqual(eventEmitted, false);
    });
  });
});
