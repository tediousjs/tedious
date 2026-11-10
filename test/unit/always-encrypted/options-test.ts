import { assert } from 'chai';

import { validateColumnEncryptionOptions, validateRequestColumnEncryption } from '../../../src/always-encrypted/options';
import { type ColumnEncryptionKeyStoreProvider } from '../../../src/always-encrypted/key-store-provider';

describe('validateColumnEncryptionOptions', function() {
  const provider: ColumnEncryptionKeyStoreProvider = {
    decryptColumnEncryptionKey: () => Buffer.alloc(32)
  };

  it('applies defaults', function() {
    const options = validateColumnEncryptionOptions({ keyStoreProviders: { AZURE_KEY_VAULT: provider } });

    assert.deepEqual(Array.from(options.keyStoreProviders), [['AZURE_KEY_VAULT', provider]]);
    assert.strictEqual(options.keyCacheTTL, 2 * 60 * 60 * 1000);
    assert.isUndefined(options.trustedKeyPaths);
    assert.strictEqual(options.parameterMetadataCacheSize, 1000);
  });

  it('accepts all options', function() {
    const options = validateColumnEncryptionOptions({
      keyStoreProviders: { AZURE_KEY_VAULT: provider, CUSTOM: provider },
      keyCacheTTL: 0,
      trustedKeyPaths: ['https://Tedious.vault.azure.net/keys/CMK'],
      parameterMetadataCacheSize: 0
    });

    assert.deepEqual(Array.from(options.keyStoreProviders.keys()), ['AZURE_KEY_VAULT', 'CUSTOM']);
    assert.strictEqual(options.keyCacheTTL, 0);
    assert.deepEqual(Array.from(options.trustedKeyPaths!), ['https://tedious.vault.azure.net/keys/cmk']);
    assert.strictEqual(options.parameterMetadataCacheSize, 0);
  });

  it('requires an object', function() {
    for (const options of [null, true, 'enabled']) {
      assert.throws(() => {
        validateColumnEncryptionOptions(options as any);
      }, TypeError, 'The "config.options.columnEncryption" property must be of type object.');
    }
  });

  it('requires key store providers', function() {
    for (const keyStoreProviders of [undefined, null, 'AZURE_KEY_VAULT']) {
      assert.throws(() => {
        validateColumnEncryptionOptions({ keyStoreProviders: keyStoreProviders as any });
      }, TypeError, 'The "config.options.columnEncryption.keyStoreProviders" property must be of type object.');
    }

    for (const invalid of [undefined, null, {}, { decryptColumnEncryptionKey: 'key' }, () => {}]) {
      assert.throws(() => {
        validateColumnEncryptionOptions({ keyStoreProviders: { CUSTOM: invalid as any } });
      }, TypeError, 'The "config.options.columnEncryption.keyStoreProviders.CUSTOM" property must be a key store provider: an object with a "decryptColumnEncryptionKey" method.');
    }
  });

  it('requires a valid lifetime of the key cache', function() {
    for (const keyCacheTTL of [-1, NaN, '1000', null]) {
      assert.throws(() => {
        validateColumnEncryptionOptions({ keyStoreProviders: {}, keyCacheTTL: keyCacheTTL as any });
      }, TypeError, 'The "config.options.columnEncryption.keyCacheTTL" property must be a non-negative number.');
    }
  });

  it('requires trusted key paths to be strings', function() {
    for (const trustedKeyPaths of ['key', [1], [undefined], null]) {
      assert.throws(() => {
        validateColumnEncryptionOptions({ keyStoreProviders: {}, trustedKeyPaths: trustedKeyPaths as any });
      }, TypeError, 'The "config.options.columnEncryption.trustedKeyPaths" property must be an array of strings.');
    }
  });

  it('requires a valid size of the parameter metadata cache', function() {
    for (const parameterMetadataCacheSize of [-1, 1.5, NaN, '10', null]) {
      assert.throws(() => {
        validateColumnEncryptionOptions({ keyStoreProviders: {}, parameterMetadataCacheSize: parameterMetadataCacheSize as any });
      }, TypeError, 'The "config.options.columnEncryption.parameterMetadataCacheSize" property must be a non-negative integer.');
    }
  });
});

describe('validateRequestColumnEncryption', function() {
  it('accepts the supported settings', function() {
    for (const value of [undefined, 'enabled', 'resultSetOnly', 'disabled']) {
      assert.strictEqual(validateRequestColumnEncryption(value), value);
    }
  });

  it('rejects anything else', function() {
    for (const value of [true, false, null, 'Enabled', 'resultsetonly', 1]) {
      assert.throws(() => {
        validateRequestColumnEncryption(value);
      }, TypeError, 'The "options.columnEncryption" property must be one of "enabled", "resultSetOnly" or "disabled".');
    }
  });
});
