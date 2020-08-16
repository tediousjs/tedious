const { assert } = require('chai');

const BulkLoad = require('../../src/bulk-load');
const TYPES = require('../../src/data-type').typeByName;

describe('BulkLoad', function() {
  it('starts out as not being canceled', function() {
    const request = new BulkLoad('tablename', { tdsVersion: '7_2' }, { });
    assert.strictEqual(request.canceled, false);
  });

  it('throws an error when adding row with a value has the wrong data type', function() {
    const request = new BulkLoad('tablename', { tdsVersion: '7_2', validateBulkLoadParameters: true }, { });
    request.addColumn('columnName', TYPES.Date, { nullable: true });
    assert.throws(() => {
      request.addRow({ columnName: 'Wrong Input' });
    }, TypeError, 'Invalid date.');
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
