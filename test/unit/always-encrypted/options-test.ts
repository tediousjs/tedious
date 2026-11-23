import { assert } from 'chai';

import { validateColumnEncryptionOptions, validateRequestColumnEncryption } from '../../../src/always-encrypted/options';
import { type ColumnEncryptionKeyStoreProvider } from '../../../src/always-encrypted/key-store-provider';

describe('validateColumnEncryptionOptions', function() {
  const provider: ColumnEncryptionKeyStoreProvider = {
    decryptColumnEncryptionKey: () => Buffer.alloc(32)
  };

  it('applies defaults', function() {
    const options = validateColumnEncryptionOptions({ keyStoreProviders: { AZURE_KEY_VAULT: provider } }, 'Server.example.com\\Instance');

    assert.deepEqual(Array.from(options.keyStoreProviders), [['AZURE_KEY_VAULT', provider]]);
    assert.isUndefined(options.trustedKeyPaths);
    assert.strictEqual(options.parameterMetadataCacheSize, 1000);

    // The name of a server is not case sensitive.
    assert.strictEqual(options.serverName, 'server.example.com\\instance');
  });

  it('accepts all options', function() {
    const options = validateColumnEncryptionOptions({
      keyStoreProviders: { AZURE_KEY_VAULT: provider, CUSTOM: provider },
      trustedKeyPaths: ['https://Tedious.vault.azure.net/keys/CMK'],
      parameterMetadataCacheSize: 0
    }, 'server');

    assert.deepEqual(Array.from(options.keyStoreProviders.keys()), ['AZURE_KEY_VAULT', 'CUSTOM']);
    assert.deepEqual(Array.from(options.trustedKeyPaths!), ['https://tedious.vault.azure.net/keys/cmk']);
    assert.strictEqual(options.parameterMetadataCacheSize, 0);
  });

  it('requires an object', function() {
    for (const options of [null, true, 'enabled']) {
      assert.throws(() => {
        validateColumnEncryptionOptions(options as any, 'server');
      }, TypeError, 'The "config.options.columnEncryption" property must be of type object.');
    }
  });

  it('requires key store providers', function() {
    for (const keyStoreProviders of [undefined, null, 'AZURE_KEY_VAULT']) {
      assert.throws(() => {
        validateColumnEncryptionOptions({ keyStoreProviders: keyStoreProviders as any }, 'server');
      }, TypeError, 'The "config.options.columnEncryption.keyStoreProviders" property must be of type object.');
    }

    for (const invalid of [undefined, null, {}, { decryptColumnEncryptionKey: 'key' }, () => {}]) {
      assert.throws(() => {
        validateColumnEncryptionOptions({ keyStoreProviders: { CUSTOM: invalid as any } }, 'server');
      }, TypeError, 'The "config.options.columnEncryption.keyStoreProviders.CUSTOM" property must be a key store provider: an object with a "decryptColumnEncryptionKey" method.');
    }
  });

  it('requires the key cache options of a key store provider to be valid', function() {
    const decryptColumnEncryptionKey = () => Buffer.alloc(32);

    // How long keys are kept is up to their key store provider.
    for (const keyCacheOptions of [{}, { keyCacheTTL: 0 }, { keyCacheTTL: Infinity, keyCacheIdleTimeout: 0 }, { keyCacheTTL: 60000, keyCacheIdleTimeout: 2 ** 31 - 1 }]) {
      validateColumnEncryptionOptions({ keyStoreProviders: { CUSTOM: { ...keyCacheOptions, decryptColumnEncryptionKey } } }, 'server');
    }

    for (const keyCacheTTL of [-1, NaN, '1000', null]) {
      assert.throws(() => {
        validateColumnEncryptionOptions({ keyStoreProviders: { CUSTOM: { keyCacheTTL: keyCacheTTL as any, decryptColumnEncryptionKey } } }, 'server');
      }, TypeError, 'The "config.options.columnEncryption.keyStoreProviders.CUSTOM.keyCacheTTL" property must be a non-negative number.');
    }

    // No longer than a timer can be set for
    for (const keyCacheIdleTimeout of [-1, NaN, '1000', null, Infinity, 2 ** 31]) {
      assert.throws(() => {
        validateColumnEncryptionOptions({ keyStoreProviders: { CUSTOM: { keyCacheIdleTimeout: keyCacheIdleTimeout as any, decryptColumnEncryptionKey } } }, 'server');
      }, TypeError, 'The "config.options.columnEncryption.keyStoreProviders.CUSTOM.keyCacheIdleTimeout" property must be a number between 0 and 2147483647.');
    }
  });

  it('requires trusted key paths to be strings', function() {
    for (const trustedKeyPaths of ['key', [1], [undefined], null]) {
      assert.throws(() => {
        validateColumnEncryptionOptions({ keyStoreProviders: {}, trustedKeyPaths: trustedKeyPaths as any }, 'server');
      }, TypeError, 'The "config.options.columnEncryption.trustedKeyPaths" property must be an array of strings.');
    }
  });

  it('requires a valid size of the parameter metadata cache', function() {
    for (const parameterMetadataCacheSize of [-1, 1.5, NaN, '10', null]) {
      assert.throws(() => {
        validateColumnEncryptionOptions({ keyStoreProviders: {}, parameterMetadataCacheSize: parameterMetadataCacheSize as any }, 'server');
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
