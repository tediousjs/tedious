const assert = require('chai').assert;
const { CEKTable } = require('../../../src/always-encrypted/CEKTable');
const { CEKTableEntry } = require('../../../src/always-encrypted/CEKTableEntry');

describe('CEKTable', () => {
  const table = new CEKTable(5);

  it('constructs correct size', () => {
    assert.strictEqual(table.keyList.length, 5);
  });

  it('setCEKTableEntry', () => {
    table.setCEKTableEntry(2, new CEKTableEntry(0));
    assert.strictEqual(table.keyList[2].ordinal, 0);
  });

  it('getCEKTableEntry', () => {
    const tableEntry = table.getCEKTableEntry(1);
    assert.strictEqual(tableEntry.ordinal, 1);
  });
});
