import { assert } from 'chai';
import { randomBytes } from 'crypto';
import sinon from 'sinon';

import { ColumnEncryptionCipher } from '../../../src/always-encrypted/cipher';
import { assertSupportedEncryption, loadColumnEncryptionKeys, type ColumnEncryptionCiphers } from '../../../src/always-encrypted/key-cache';
import { validateColumnEncryptionOptions } from '../../../src/always-encrypted/options';
import { type ColumnEncryptionKeyStoreProvider } from '../../../src/always-encrypted/key-store-provider';
import { type ColumnEncryptionKeyInfo, type ColumnEncryptionOptions, type EncryptedColumnEncryptionKey } from '../../../src/always-encrypted/types';

/**
 * A key store whose "encrypted" column encryption keys are the keys
 * themselves, and that records what it is asked to decrypt.
 */
class FakeKeyStoreProvider implements ColumnEncryptionKeyStoreProvider {
  calls: { masterKeyPath: string, encryptionAlgorithm: string, encryptedColumnEncryptionKey: Buffer }[] = [];

  // The key paths that fail to decrypt.
  unavailable = new Set<string>();

  async decryptColumnEncryptionKey(masterKeyPath: string, encryptionAlgorithm: string, encryptedColumnEncryptionKey: Buffer) {
    this.calls.push({ masterKeyPath, encryptionAlgorithm, encryptedColumnEncryptionKey });

    if (this.unavailable.has(masterKeyPath)) {
      throw new Error(`no access to ${masterKeyPath}`);
    }

    return encryptedColumnEncryptionKey;
  }
}

function keyValue(overrides: Partial<EncryptedColumnEncryptionKey> = {}): EncryptedColumnEncryptionKey {
  return { encryptedKey: randomBytes(32), keyStoreName: 'FAKE', keyPath: 'key/1', algorithm: 'RSA_OAEP', ...overrides };
}

function keyInfo(...values: EncryptedColumnEncryptionKey[]): ColumnEncryptionKeyInfo {
  return { databaseId: 5, keyId: 1, keyVersion: 1, metadataVersion: Buffer.alloc(8), values };
}

async function rejection(promise: unknown): Promise<Error> {
  try {
    await promise;
  } catch (error: any) {
    return error;
  }

  assert.fail('Expected the promise to be rejected');
}

describe('loadColumnEncryptionKeys', function() {
  const serverName = 'server.example.com:1433';

  let provider: FakeKeyStoreProvider;

  function optionsWith(options: Partial<ColumnEncryptionOptions> = {}) {
    return validateColumnEncryptionOptions({ keyStoreProviders: { FAKE: provider }, ...options }, serverName);
  }

  // The cipher of a key that is loaded without a key store being accessed.
  function cachedCipher(key: ColumnEncryptionKeyInfo, options = optionsWith()) {
    const ciphers = loadColumnEncryptionKeys([key], options);
    assert.instanceOf(ciphers, Map);

    return (ciphers as ColumnEncryptionCiphers).get(key);
  }

  beforeEach(function() {
    provider = new FakeKeyStoreProvider();
  });

  afterEach(function() {
    sinon.restore();
  });

  it('returns no ciphers if there are no keys to load', function() {
    assert.deepEqual(loadColumnEncryptionKeys([], optionsWith()), new Map());
  });

  it('decrypts keys via the key store provider of their column master key', async function() {
    const value = keyValue();
    const key = keyInfo(value);

    const loading = loadColumnEncryptionKeys([key], optionsWith());
    assert.instanceOf(loading, Promise);

    const ciphers = await loading;
    const cipher = ciphers.get(key);

    assert.instanceOf(cipher, ColumnEncryptionCipher);
    assert.deepEqual(provider.calls, [{ masterKeyPath: 'key/1', encryptionAlgorithm: 'RSA_OAEP', encryptedColumnEncryptionKey: value.encryptedKey }]);

    // The cipher is the one of the column encryption key.
    const plaintext = Buffer.from('plaintext');
    assert.deepEqual(new ColumnEncryptionCipher(value.encryptedKey).decrypt(cipher!.encrypt(plaintext, true)), plaintext);
  });

  it('does not attach the ciphers to the keys', async function() {
    // The description of a key is handed out to applications, a cipher
    // holds what is derived from the key.
    const key = keyInfo(keyValue());
    const description = JSON.stringify(key);

    await loadColumnEncryptionKeys([key], optionsWith());
    cachedCipher(key);

    assert.deepEqual(Reflect.ownKeys(key), ['databaseId', 'keyId', 'keyVersion', 'metadataVersion', 'values']);
    assert.strictEqual(JSON.stringify(key), description);
  });

  it('accepts keys that are returned as a `Uint8Array`, or without a promise', async function() {
    const value = keyValue();

    for (const result of [new Uint8Array(value.encryptedKey), Promise.resolve(new Uint8Array(value.encryptedKey)), value.encryptedKey]) {
      const key = keyInfo(value);
      const ciphers = await loadColumnEncryptionKeys([key], validateColumnEncryptionOptions({
        keyStoreProviders: { FAKE: { decryptColumnEncryptionKey: () => result } }
      }, serverName));

      const plaintext = Buffer.from('plaintext');
      assert.deepEqual(new ColumnEncryptionCipher(value.encryptedKey).decrypt(ciphers.get(key)!.encrypt(plaintext, true)), plaintext);
    }
  });

  it('loads cached keys without returning a promise', async function() {
    const value = keyValue();
    const options = optionsWith();

    const first = keyInfo(value);
    const ciphers = await loadColumnEncryptionKeys([first], options);

    // The same key, as it is described by another response.
    const second = keyInfo({ ...value, encryptedKey: Buffer.from(value.encryptedKey) });

    assert.strictEqual(cachedCipher(second, options), ciphers.get(first));
    assert.lengthOf(provider.calls, 1);
  });

  it('shares cached keys between connections that share a key store provider', async function() {
    const value = keyValue();

    const first = keyInfo(value);
    const cipher = (await loadColumnEncryptionKeys([first], optionsWith())).get(first);

    assert.strictEqual(cachedCipher(keyInfo(value), optionsWith()), cipher);

    // Another instance of the key store provider is a different key store.
    const otherProvider = new FakeKeyStoreProvider();
    const third = keyInfo(value);
    const otherCiphers = await loadColumnEncryptionKeys([third], validateColumnEncryptionOptions({ keyStoreProviders: { FAKE: otherProvider } }, serverName));

    assert.notStrictEqual(otherCiphers.get(third), cipher);
    assert.lengthOf(provider.calls, 1);
    assert.lengthOf(otherProvider.calls, 1);
  });

  it('does not share cached keys between servers', async function() {
    const value = keyValue();

    const key = keyInfo(value);
    const cipher = (await loadColumnEncryptionKeys([key], optionsWith())).get(key);

    // The same encrypted key, sent by another server (or by another
    // instance, or on another port, of the same server).
    for (const otherServer of ['other.example.com:1433', 'server.example.com:1434', 'server.example.com\\instance']) {
      const options = validateColumnEncryptionOptions({ keyStoreProviders: { FAKE: provider } }, otherServer);

      const other = keyInfo(value);
      const loading = loadColumnEncryptionKeys([other], options);
      assert.instanceOf(loading, Promise, otherServer);
      assert.notStrictEqual((await loading).get(other), cipher, otherServer);
    }

    assert.lengthOf(provider.calls, 4);

    // The name of a server is not case sensitive.
    const sameServer = validateColumnEncryptionOptions({ keyStoreProviders: { FAKE: provider } }, 'SERVER.example.com:1433');
    assert.strictEqual(cachedCipher(keyInfo(value), sameServer), cipher);
  });

  it('decrypts a key only once while it is being decrypted', async function() {
    const value = keyValue();
    const options = optionsWith();

    const keys = [keyInfo(value), keyInfo(value), keyInfo(value)];
    const [first, others] = await Promise.all([
      loadColumnEncryptionKeys([keys[0]], options),
      loadColumnEncryptionKeys([keys[1], keys[2]], options)
    ]);

    assert.lengthOf(provider.calls, 1);
    assert.instanceOf(first.get(keys[0]), ColumnEncryptionCipher);
    assert.strictEqual(others.get(keys[1]), first.get(keys[0]));
    assert.strictEqual(others.get(keys[2]), first.get(keys[0]));
  });

  it('distinguishes keys by their encrypted value, key path and algorithm', async function() {
    const value = keyValue();
    const options = optionsWith();

    await loadColumnEncryptionKeys([
      keyInfo(value),
      keyInfo({ ...value, encryptedKey: randomBytes(32) }),
      keyInfo({ ...value, keyPath: 'key/2' }),
      keyInfo({ ...value, algorithm: 'OTHER' })
    ], options);

    assert.lengthOf(provider.calls, 4);
  });

  it('decrypts keys again once they expired', async function() {
    const clock = sinon.useFakeTimers({ toFake: ['Date'] });
    const value = keyValue();
    const options = optionsWith({ keyCacheTTL: 1000 });

    await loadColumnEncryptionKeys([keyInfo(value)], options);

    clock.tick(999);
    assert.instanceOf(cachedCipher(keyInfo(value), options), ColumnEncryptionCipher);
    assert.lengthOf(provider.calls, 1);

    clock.tick(1);
    const key = keyInfo(value);
    const ciphers = await loadColumnEncryptionKeys([key], options);

    assert.instanceOf(ciphers.get(key), ColumnEncryptionCipher);
    assert.lengthOf(provider.calls, 2);
  });

  it('applies the lifetime of the cache to keys that were loaded before', async function() {
    const clock = sinon.useFakeTimers({ toFake: ['Date'] });
    const options = optionsWith({ keyCacheTTL: 1000 });

    // Like the keys of cached parameter encryption metadata
    const key = keyInfo(keyValue());
    const cipher = (await loadColumnEncryptionKeys([key], options)).get(key);

    assert.strictEqual(cachedCipher(key, options), cipher);

    clock.tick(1000);
    const ciphers = await loadColumnEncryptionKeys([key], options);

    assert.notStrictEqual(ciphers.get(key), cipher);
    assert.lengthOf(provider.calls, 2);
  });

  it('applies the lifetime of each connection to the keys of a shared key store provider', async function() {
    const clock = sinon.useFakeTimers({ toFake: ['Date'] });
    const value = keyValue();

    // Cached for a connection that keeps keys for a long time ...
    await loadColumnEncryptionKeys([keyInfo(value)], optionsWith({ keyCacheTTL: 60000 }));
    assert.lengthOf(provider.calls, 1);

    // ... which a connection that does not cache keys makes no use of,
    await loadColumnEncryptionKeys([keyInfo(value)], optionsWith({ keyCacheTTL: 0 }));
    assert.lengthOf(provider.calls, 2);

    // and neither does one that keeps keys for a shorter time, once that
    // time has passed.
    clock.tick(1000);
    assert.instanceOf(loadColumnEncryptionKeys([keyInfo(value)], optionsWith({ keyCacheTTL: 2000 })), Map);
    assert.lengthOf(provider.calls, 2);

    clock.tick(1000);
    await loadColumnEncryptionKeys([keyInfo(value)], optionsWith({ keyCacheTTL: 2000 }));
    assert.lengthOf(provider.calls, 3);

    // The key is cached anew for all of them.
    assert.instanceOf(loadColumnEncryptionKeys([keyInfo(value)], optionsWith({ keyCacheTTL: 60000 })), Map);
    assert.lengthOf(provider.calls, 3);
  });

  it('does not cache keys if the cache is disabled', async function() {
    const value = keyValue();
    const options = optionsWith({ keyCacheTTL: 0 });

    await loadColumnEncryptionKeys([keyInfo(value)], options);
    await loadColumnEncryptionKeys([keyInfo(value)], options);

    assert.lengthOf(provider.calls, 2);
  });

  it('does not cache failures', async function() {
    const value = keyValue();
    const options = optionsWith();

    provider.unavailable.add('key/1');
    const error = await rejection(loadColumnEncryptionKeys([keyInfo(value)], options));
    assert.strictEqual(error.message, 'The key store provider "FAKE" failed to decrypt a column encryption key with the column master key "key/1": no access to key/1');
    assert.strictEqual((error.cause as Error).message, 'no access to key/1');

    provider.unavailable.clear();
    const key = keyInfo(value);
    const ciphers = await loadColumnEncryptionKeys([key], options);

    assert.instanceOf(ciphers.get(key), ColumnEncryptionCipher);
    assert.lengthOf(provider.calls, 2);
  });

  it('uses the first of the encrypted values of a key that can be decrypted', async function() {
    // While a column master key is rotated, a key is protected by both.
    const columnEncryptionKey = randomBytes(32);
    const key = keyInfo(
      keyValue({ encryptedKey: columnEncryptionKey, keyStoreName: 'UNKNOWN', keyPath: 'key/unknown' }),
      keyValue({ encryptedKey: columnEncryptionKey, keyPath: 'key/unavailable' }),
      keyValue({ encryptedKey: columnEncryptionKey, keyPath: 'key/available' }),
      keyValue({ encryptedKey: columnEncryptionKey, keyPath: 'key/unused' })
    );

    provider.unavailable.add('key/unavailable');
    const options = optionsWith();

    const ciphers = await loadColumnEncryptionKeys([key], options);
    assert.instanceOf(ciphers.get(key), ColumnEncryptionCipher);
    assert.deepEqual(provider.calls.map((call) => call.masterKeyPath), ['key/unavailable', 'key/available']);

    // The value that could be decrypted is found in the cache.
    assert.strictEqual(cachedCipher(keyInfo(...key.values), options), ciphers.get(key));
    assert.lengthOf(provider.calls, 2);
  });

  it('fails with the error of the first encrypted value if none can be decrypted', async function() {
    provider.unavailable.add('key/1').add('key/2');

    const error = await rejection(loadColumnEncryptionKeys([keyInfo(keyValue({ keyPath: 'key/1' }), keyValue({ keyPath: 'key/2' }))], optionsWith()));
    assert.match(error.message, /no access to key\/1$/);
  });

  it('fails for keys without encrypted values', async function() {
    const error = await rejection(loadColumnEncryptionKeys([keyInfo()], optionsWith()));
    assert.strictEqual(error.message, 'The server did not send any encrypted values for the column encryption key.');
  });

  it('fails if no key store provider is registered for the key store', async function() {
    const key = keyInfo(keyValue({ keyStoreName: 'AZURE_KEY_VAULT', keyPath: 'https://tedious.vault.azure.net/keys/cmk/1' }));

    let error = await rejection(loadColumnEncryptionKeys([key], optionsWith()));
    assert.strictEqual(error.message, 'No key store provider is registered for the key store "AZURE_KEY_VAULT" of the column master key "https://tedious.vault.azure.net/keys/cmk/1". Registered key store providers: "FAKE".');

    error = await rejection(loadColumnEncryptionKeys([key], validateColumnEncryptionOptions({ keyStoreProviders: {} }, serverName)));
    assert.match(error.message, /Registered key store providers: none\.$/);

    // Key store names are not looked up on the prototype of the providers.
    error = await rejection(loadColumnEncryptionKeys([keyInfo(keyValue({ keyStoreName: 'constructor' }))], optionsWith()));
    assert.match(error.message, /^No key store provider is registered for the key store "constructor"/);
  });

  it('fails if the key store provider does not return a key', async function() {
    for (const result of [undefined, null, 'key', [1, 2, 3]]) {
      const error = await rejection(loadColumnEncryptionKeys([keyInfo(keyValue())], validateColumnEncryptionOptions({
        keyStoreProviders: { FAKE: { decryptColumnEncryptionKey: () => result as any } }
      }, serverName)));

      assert.strictEqual(error.message, 'The key store provider "FAKE" did not return the decrypted column encryption key as a Buffer or Uint8Array.');
    }
  });

  it('fails if the decrypted key does not have the length of a column encryption key', async function() {
    const error = await rejection(loadColumnEncryptionKeys([keyInfo(keyValue({ encryptedKey: randomBytes(16) }))], optionsWith()));
    assert.match(error.message, /must be 32 bytes long, but the key is 16 bytes long/);
  });

  it('fails if any of the keys fails to load', async function() {
    provider.unavailable.add('key/2');

    const keys = [keyInfo(keyValue({ keyPath: 'key/1' })), keyInfo(keyValue({ keyPath: 'key/2' }))];
    const error = await rejection(loadColumnEncryptionKeys(keys, optionsWith()));

    assert.match(error.message, /no access to key\/2$/);
  });

  describe('trusted key paths', function() {
    it('only decrypts keys that are protected by a trusted column master key', async function() {
      const options = optionsWith({ trustedKeyPaths: ['Key/Trusted'] });

      const trusted = keyInfo(keyValue({ keyPath: 'key/trusted' }));
      const ciphers = await loadColumnEncryptionKeys([trusted], options);
      assert.instanceOf(ciphers.get(trusted), ColumnEncryptionCipher);

      const error = await rejection(loadColumnEncryptionKeys([keyInfo(keyValue({ keyPath: 'key/other' }))], options));
      assert.strictEqual(error.message, 'The column master key path "key/other" is not one of the trusted key paths.');

      assert.deepEqual(provider.calls.map((call) => call.masterKeyPath), ['key/trusted']);
    });

    it('does not use cached keys of column master keys that are not trusted', async function() {
      const value = keyValue();

      // Decrypted, and cached, for a connection that trusts all key paths.
      await loadColumnEncryptionKeys([keyInfo(value)], optionsWith());

      const error = await rejection(loadColumnEncryptionKeys([keyInfo(value)], optionsWith({ trustedKeyPaths: ['key/other'] })));
      assert.strictEqual(error.message, 'The column master key path "key/1" is not one of the trusted key paths.');
    });

    it('trusts no key path if the list is empty', async function() {
      const error = await rejection(loadColumnEncryptionKeys([keyInfo(keyValue())], optionsWith({ trustedKeyPaths: [] })));
      assert.strictEqual(error.message, 'The column master key path "key/1" is not one of the trusted key paths.');
    });
  });
});

describe('assertSupportedEncryption', function() {
  it('accepts the algorithm and normalization rules of Always Encrypted', function() {
    assertSupportedEncryption({ algorithmId: 2, algorithmName: undefined, normalizationRuleVersion: 1 });
  });

  it('rejects other algorithms', function() {
    assert.throws(() => {
      assertSupportedEncryption({ algorithmId: 1, normalizationRuleVersion: 1 });
    }, 'Unsupported column encryption algorithm 1, only "AEAD_AES_256_CBC_HMAC_SHA256" is supported.');

    assert.throws(() => {
      assertSupportedEncryption({ algorithmId: 0, algorithmName: 'CUSTOM', normalizationRuleVersion: 1 });
    }, 'Unsupported column encryption algorithm "CUSTOM", only "AEAD_AES_256_CBC_HMAC_SHA256" is supported.');
  });

  it('rejects other normalization rule versions', function() {
    assert.throws(() => {
      assertSupportedEncryption({ algorithmId: 2, normalizationRuleVersion: 2 });
    }, 'Unsupported column encryption normalization rule version 2, only version 1 is supported.');
  });
});
