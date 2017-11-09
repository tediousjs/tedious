var BulkLoad = require('../../src/bulk-load');

exports['test invalid bulkOptions'] = function(test) {
  test.expect(2);
  const bulkLoad = new BulkLoad();
  test.throws(() => bulkLoad.setOptions(), TypeError, 'No Exception thrown for empty options to bulkLoad');
  test.throws(() => bulkLoad.setOptions('garbageText'), TypeError, 'No Exception thrown for invalid bulk load option');
  test.done();
};
