const assert = require('chai').assert;
const keyCrypto = require('../../../src/always-encrypted/key-crypto');

const {
  alwaysEncryptedOptions,
  cryptoMetadata,
  alwaysEncryptedConstants,
} = require('./crypto-util');

describe('key-crypto', () => {
  describe('decryptSymmetricKey', () => {
    it('get symmetric key (no cache)', async () => {
      const metadata = {
        ...cryptoMetadata,
      };

      await keyCrypto.decryptSymmetricKey(metadata, alwaysEncryptedOptions);

      assert.deepEqual(metadata.cipherAlgorithm.columnEncryptionkey.getEncryptionKey(), alwaysEncryptedConstants.encryptionKey);
      assert.deepEqual(metadata.cipherAlgorithm.isDeterministic, cryptoMetadata.encryptionType === 0x01);
      assert.deepEqual(metadata.encryptionKeyInfo, cryptoMetadata.cekTableEntry.columnEncryptionKeyValues[0]);
    });

    it('get symmetric key (with cache)', async () => {
      const metadata = {
        ...cryptoMetadata,
      };

      await keyCrypto.decryptSymmetricKey(metadata, alwaysEncryptedOptions);

      assert.deepEqual(metadata.cipherAlgorithm.columnEncryptionkey.getEncryptionKey(), alwaysEncryptedConstants.encryptionKey);
      assert.deepEqual(metadata.cipherAlgorithm.isDeterministic, cryptoMetadata.encryptionType === 0x01);
      assert.deepEqual(metadata.encryptionKeyInfo, cryptoMetadata.cekTableEntry.columnEncryptionKeyValues[0]);
    });

    it('key not found', async () => {
      const metadata = {
        ...cryptoMetadata,
        cekTableEntry: {
          ...cryptoMetadata.cekTableEntry,
          columnEncryptionKeyValues: [],
        },
      };

      try {
        await keyCrypto.decryptSymmetricKey(metadata, alwaysEncryptedOptions);

        assert.isTrue(false);
      } catch {
        assert.isTrue(true);
      }
    });
  });
});
