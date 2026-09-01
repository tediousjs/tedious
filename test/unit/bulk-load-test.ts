import { assert } from 'chai';
import BulkLoad from '../../src/bulk-load';
import { type InternalConnectionOptions } from '../../src/connection';
import { typeByName as TYPES } from '../../src/data-type';

// Test options - using type assertion since tests only exercise code paths
// that use a subset of the full InternalConnectionOptions
const connectionOptions = { tdsVersion: '7_2' } as InternalConnectionOptions;

describe('BulkLoad', function() {
  describe('#addColumn', function() {
    it('requires an explicit length for vector columns', function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});

      assert.throws(() => {
        request.addColumn('v', TYPES.Vector, { nullable: true });
      }, Error, /number of dimensions of a vector column must be specified/);

      request.addColumn('v', TYPES.Vector, { nullable: true, length: 3 });
    });
  });

  it('starts out as not being canceled', function() {
    const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
    assert.strictEqual(request.canceled, false);
  });

  describe('#cancel', function() {
    it('marks the request as canceled', function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.cancel();
      assert.strictEqual(request.canceled, true);
    });

    it('emits a `cancel` event', function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});

      let eventEmitted = false;
      request.on('cancel', () => { eventEmitted = true; });
      request.cancel();

      assert.strictEqual(eventEmitted, true);
    });

    it('only emits the `cancel` event on the first call', function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.cancel();

      let eventEmitted = false;
      request.on('cancel', () => { eventEmitted = true; });
      request.cancel();

      assert.strictEqual(eventEmitted, false);
    });
  });
});
