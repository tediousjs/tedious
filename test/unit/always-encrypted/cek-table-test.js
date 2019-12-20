const assert = require('chai').assert;
const { CEKTable, CEKTableEntry } = require('../../../src/always-encrypted/cek-table');

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

describe('CEKTableEntry', () => {
  it('constructs CEKTableEntry', () => {
    const tableEntry = new CEKTableEntry(1);
    assert.strictEqual(tableEntry.ordinal, 1);
    assert.strictEqual(tableEntry.databaseId, 0);
    assert.strictEqual(tableEntry.cekId, 0);
    assert.strictEqual(tableEntry.cekVersion, 0);
    assert.deepEqual(tableEntry.cekMdVersion, Buffer.alloc(0));
    assert.deepEqual(tableEntry.columnEncryptionKeyValues, []);
  });

  it('adds encryption key value', () => {
    const tableEntry = new CEKTableEntry(0);

    tableEntry.add(
      Buffer.from([0x01, 0x02, 0x03, 0x04]),
      1,
      1,
      1,
      Buffer.from([0x01, 0x01, 0x01]),
      'keyPath',
      'keyStoreName',
      'algorithmName'
    );

    assert.deepEqual(tableEntry.columnEncryptionKeyValues[0], {
      encryptedKey: Buffer.from([0x01, 0x02, 0x03, 0x04]),
      dbId: 1,
      keyId: 1,
      keyVersion: 1,
      mdVersion: Buffer.from([0x01, 0x01, 0x01]),
      keyPath: 'keyPath',
      keyStoreName: 'keyStoreName',
      algorithmName: 'algorithmName',
    });
    assert.strictEqual(tableEntry.ordinal, 0);
    assert.strictEqual(tableEntry.databaseId, 1);
    assert.strictEqual(tableEntry.cekId, 1);
    assert.strictEqual(tableEntry.cekVersion, 1);
    assert.deepEqual(tableEntry.cekMdVersion, Buffer.from([0x01, 0x01, 0x01]));
  });

  it('throws when added key metadata does not match other entries', () => {
    const tableEntry = new CEKTableEntry(0);

    tableEntry.add(
      Buffer.from([0x01, 0x02, 0x03, 0x04]),
      1,
      1,
      1,
      Buffer.from([0x01, 0x01, 0x01]),
      'keyPath',
      'keyStoreName',
      'algorithmName'
    );

    assert.throws(() => tableEntry.add(Buffer.from([0x01, 0x02, 0x03, 0x04]),
      2,
      1,
      1,
      Buffer.from([0x01, 0x01, 0x01]),
      'keyPath',
      'keyStoreName',
      'algorithmName'
    ), 'Invalid databaseId, cekId, cekVersion or cekMdVersion.');
  });
});
