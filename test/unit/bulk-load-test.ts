import { assert } from 'chai';
import BulkLoad from '../../src/bulk-load';
import { TYPES } from '../../src/data-type';
import { type InternalConnectionOptions } from '../../src/connection';

// Test options - using type assertion since tests only exercise code paths
// that use a subset of the full InternalConnectionOptions
const connectionOptions = { tdsVersion: '7_2' } as InternalConnectionOptions;

describe('BulkLoad', function() {
  it('starts out as not being canceled', function() {
    const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
    assert.strictEqual(request.canceled, false);
  });

  describe('#getColMetaData', function() {
    it('substitutes `varchar(max)` type info for `json` columns', function() {
      const request = new BulkLoad('tablename', undefined, connectionOptions, { }, () => {});
      request.addColumn('value', TYPES.JSON, { nullable: true });

      const expected = Buffer.concat([
        Buffer.from([0x81]), // COLMETADATA
        Buffer.from([0x01, 0x00]), // column count
        Buffer.from([0x00, 0x00, 0x00, 0x00]), // user type
        Buffer.from([0x05, 0x00]), // flags (updateableReadWrite | nullable)
        // The `json` data type (0xF4) is rejected by the server in bulk
        // loads - `varchar(max)` with a zeroed collation is sent instead.
        Buffer.from([0xA7, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00]),
        Buffer.from('\x05v\0a\0l\0u\0e\0', 'binary') // column name
      ]);

      assert.deepEqual(request.getColMetaData(), expected);
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
