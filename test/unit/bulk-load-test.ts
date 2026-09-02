import { assert } from 'chai';
import BulkLoad from '../../src/bulk-load';
import { type InternalConnectionOptions } from '../../src/connection';
import { typeByName as TYPES, type DataType } from '../../src/data-type';

// Test options - using type assertion since tests only exercise code paths
// that use a subset of the full InternalConnectionOptions
const connectionOptions = { tdsVersion: '7_2' } as InternalConnectionOptions;

describe('BulkLoad', function() {
  it('starts out as not being canceled', function() {
    const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
    assert.strictEqual(request.canceled, false);
  });

  describe('#addColumn', function() {
    it('resolves the length for types with ids outside the legacy variable-length id bit pattern', function() {
      // Like the type ids introduced in TDS 7.2 and later (e.g. VECTORTYPE
      // 0xF5), which do not match `(id & 0x30) === 0x20`.
      const type: DataType = {
        ...TYPES.VarBinary,
        id: 0xF5,
        resolveLength() {
          return 42;
        }
      };

      const bulkLoad = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      bulkLoad.addColumn('modern', type, { nullable: true });
      bulkLoad.addColumn('explicit', type, { nullable: true, length: 7 });
      bulkLoad.addColumn('legacy', TYPES.VarBinary, { nullable: true });

      assert.strictEqual(bulkLoad.columns[0].length, 42);
      assert.strictEqual(bulkLoad.columns[1].length, 7);
      assert.strictEqual(bulkLoad.columns[2].length, TYPES.VarBinary.maximumLength);
    });
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
