const { assert } = require('chai');

const BulkLoad = require('../../src/bulk-load');

describe('BulkLoad', function() {
  it('starts out as not being canceled', function() {
    const request = new BulkLoad('tablename', { tdsVersion: '7_2' }, { });
    assert.strictEqual(request.canceled, false);
  });

  describe('#cancel', function() {
    it('marks the request as canceled', function() {
      const request = new BulkLoad('tablename', { tdsVersion: '7_2' }, { });
      request.cancel();
      assert.strictEqual(request.canceled, true);
    });

    it('emits a `cancel` event', function() {
      const request = new BulkLoad('tablename', { tdsVersion: '7_2' }, { });

      let eventEmitted = false;
      request.on('cancel', () => { eventEmitted = true; });
      request.cancel();

      assert.strictEqual(eventEmitted, true);
    });

    it('only emits the `cancel` event on the first call', function() {
      const request = new BulkLoad('tablename', { tdsVersion: '7_2' }, { });
      request.cancel();

      let eventEmitted = false;
      request.on('cancel', () => { eventEmitted = true; });
      request.cancel();

      assert.strictEqual(eventEmitted, false);
    });
  });
});
