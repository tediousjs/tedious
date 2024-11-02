const assert = require('chai').assert;
const { CEKEntry } = require('../../../src/always-encrypted/cek-entry');

describe('CEKEntry', () => {
  it('constructs CEKEntry', () => {
    const entry = new CEKEntry(1);
    assert.strictEqual(entry.ordinal, 1);
    assert.strictEqual(entry.databaseId, 0);
    assert.strictEqual(entry.cekId, 0);
    assert.strictEqual(entry.cekVersion, 0);
    assert.deepEqual(entry.cekMdVersion, Buffer.alloc(0));
    assert.deepEqual(entry.columnEncryptionKeyValues, []);
  });

  it('adds encryption key value', () => {
    const entry = new CEKEntry(0);

    entry.add(
      Buffer.from([0x01, 0x02, 0x03, 0x04]),
      1,
      1,
      1,
      Buffer.from([0x01, 0x01, 0x01]),
      'keyPath',
      'keyStoreName',
      'algorithmName'
    );

    assert.deepEqual(entry.columnEncryptionKeyValues[0], {
      encryptedKey: Buffer.from([0x01, 0x02, 0x03, 0x04]),
      dbId: 1,
      keyId: 1,
      keyVersion: 1,
      mdVersion: Buffer.from([0x01, 0x01, 0x01]),
      keyPath: 'keyPath',
      keyStoreName: 'keyStoreName',
      algorithmName: 'algorithmName',
    });
    assert.strictEqual(entry.ordinal, 0);
    assert.strictEqual(entry.databaseId, 1);
    assert.strictEqual(entry.cekId, 1);
    assert.strictEqual(entry.cekVersion, 1);
    assert.deepEqual(entry.cekMdVersion, Buffer.from([0x01, 0x01, 0x01]));
  });

  it('throws when added key metadata does not match other entries', () => {
    const entry = new CEKEntry(0);

    entry.add(
      Buffer.from([0x01, 0x02, 0x03, 0x04]),
      1,
      1,
      1,
      Buffer.from([0x01, 0x01, 0x01]),
      'keyPath',
      'keyStoreName',
      'algorithmName'
    );

    assert.throws(() => entry.add(
      Buffer.from([0x01, 0x02, 0x03, 0x04]),
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
