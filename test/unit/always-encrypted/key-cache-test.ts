import { assert } from 'chai';
import { randomBytes } from 'crypto';
import sinon from 'sinon';

import { ColumnEncryptionCipher } from '../../../src/always-encrypted/cipher';
import { assertSupportedEncryption, loadColumnEncryptionKeys, type ColumnEncryptionCiphers } from '../../../src/always-encrypted/key-cache';
import { validateColumnEncryptionOptions } from '../../../src/always-encrypted/options';
import { type ColumnEncryptionKeyStoreProvider, type KeyCacheOptions } from '../../../src/always-encrypted/key-store-provider';
import { type ColumnEncryptionKeyInfo, type ColumnEncryptionOptions, type EncryptedColumnEncryptionKey } from '../../../src/always-encrypted/types';

/**
 * A key store whose "encrypted" column encryption keys are the keys
 * themselves, and that records what it is asked to decrypt.
 */
class FakeKeyStoreProvider implements ColumnEncryptionKeyStoreProvider {
  // How long the keys of the key store are kept
  keyCacheTTL: number | undefined;
  keyCacheIdleTimeout: number | undefined;

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

  // The options of a connection that uses the provider, which is what says
  // how long its keys are kept.
  function optionsWith({ keyCacheTTL, keyCacheIdleTimeout, ...options }: Partial<ColumnEncryptionOptions> & KeyCacheOptions = {}) {
    if (keyCacheTTL !== undefined) {
      provider.keyCacheTTL = keyCacheTTL;
    }

    if (keyCacheIdleTimeout !== undefined) {
      provider.keyCacheIdleTimeout = keyCacheIdleTimeout;
    }

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

  it('keeps the keys of each key store provider for as long as that provider says', async function() {
    const clock = sinon.useFakeTimers({ toFake: ['Date'] });
    const value = keyValue();

    const brief = new FakeKeyStoreProvider();
    brief.keyCacheTTL = 1000;

    // Keys are kept whether they are used or not.
    provider.keyCacheIdleTimeout = 0;
    brief.keyCacheIdleTimeout = 0;

    const options = validateColumnEncryptionOptions({ keyStoreProviders: { FAKE: provider, BRIEF: brief } }, serverName);
    const keys = () => [keyInfo(value), keyInfo({ ...value, keyStoreName: 'BRIEF' })];

    await loadColumnEncryptionKeys(keys(), options);

    clock.tick(1000);
    await loadColumnEncryptionKeys(keys(), options);

    // The provider that does not say keeps its keys for 2 hours.
    assert.lengthOf(provider.calls, 1);
    assert.lengthOf(brief.calls, 2);

    clock.tick(2 * 60 * 60 * 1000 - 1001);
    assert.instanceOf(loadColumnEncryptionKeys([keyInfo(value)], options), Map);

    clock.tick(1);
    await loadColumnEncryptionKeys([keyInfo(value)], options);
    assert.lengthOf(provider.calls, 2);
  });

  it('applies a lifetime that the key store provider changed', async function() {
    const clock = sinon.useFakeTimers({ toFake: ['Date'] });
    const value = keyValue();
    const options = optionsWith({ keyCacheTTL: 60000 });

    await loadColumnEncryptionKeys([keyInfo(value)], options);

    clock.tick(1000);
    assert.instanceOf(loadColumnEncryptionKeys([keyInfo(value)], options), Map);
    assert.lengthOf(provider.calls, 1);

    // The key was decrypted too long ago for the new lifetime.
    provider.keyCacheTTL = 1000;
    await loadColumnEncryptionKeys([keyInfo(value)], options);
    assert.lengthOf(provider.calls, 2);

    // Keys are not kept at all.
    provider.keyCacheTTL = 0;
    await loadColumnEncryptionKeys([keyInfo(value)], options);
    await loadColumnEncryptionKeys([keyInfo(value)], options);
    assert.lengthOf(provider.calls, 4);
  });

  describe('idle timeout', function() {
    // Whether a key is in the cache, used or not: it is found for as long
    // as nothing removed it, once neither of the two limits applies.
    const isCached = (value: EncryptedColumnEncryptionKey) => {
      const { keyCacheTTL, keyCacheIdleTimeout } = provider;
      provider.keyCacheTTL = Infinity;
      provider.keyCacheIdleTimeout = 0;

      try {
        return loadColumnEncryptionKeys([keyInfo(value)], optionsWith()) instanceof Map;
      } finally {
        provider.keyCacheTTL = keyCacheTTL;
        provider.keyCacheIdleTimeout = keyCacheIdleTimeout;
      }
    };

    it('removes a key once it was not used for the idle timeout', async function() {
      const clock = sinon.useFakeTimers();
      const value = keyValue();

      await loadColumnEncryptionKeys([keyInfo(value)], optionsWith({ keyCacheIdleTimeout: 1000 }));

      await clock.tickAsync(999);
      assert.lengthOf(provider.calls, 1);

      // Not when the key is asked for the next time, but when the time is up
      await clock.tickAsync(1);
      assert.isFalse(isCached(value));
    });

    it('keeps a key for as long as it is used', async function() {
      const clock = sinon.useFakeTimers();
      const value = keyValue();
      const options = optionsWith({ keyCacheIdleTimeout: 1000 });

      const key = keyInfo(value);
      const cipher = (await loadColumnEncryptionKeys([key], options)).get(key);

      for (let i = 0; i < 10; i++) {
        await clock.tickAsync(999);
        assert.strictEqual(cachedCipher(keyInfo(value), options), cipher);
      }

      assert.lengthOf(provider.calls, 1);

      await clock.tickAsync(1000);
      assert.instanceOf(loadColumnEncryptionKeys([keyInfo(value)], options), Promise);
      assert.lengthOf(provider.calls, 2);
    });

    it('does not keep a key that is used for longer than its lifetime', async function() {
      const clock = sinon.useFakeTimers();
      const value = keyValue();
      const options = optionsWith({ keyCacheIdleTimeout: 1000, keyCacheTTL: 2500 });

      await loadColumnEncryptionKeys([keyInfo(value)], options);

      await clock.tickAsync(900);
      assert.instanceOf(loadColumnEncryptionKeys([keyInfo(value)], options), Map);
      await clock.tickAsync(900);
      assert.instanceOf(loadColumnEncryptionKeys([keyInfo(value)], options), Map);

      // The key store is asked again, however recently the key was used.
      await clock.tickAsync(700);
      assert.instanceOf(loadColumnEncryptionKeys([keyInfo(value)], options), Promise);
      assert.lengthOf(provider.calls, 2);
    });

    it('does not use a key that was not used for the idle timeout, even if it was not removed yet', async function() {
      const clock = sinon.useFakeTimers({ toFake: ['Date'] });
      const value = keyValue();
      const options = optionsWith({ keyCacheIdleTimeout: 1000 });

      await loadColumnEncryptionKeys([keyInfo(value)], options);

      // The time has passed, without the timer having had its turn.
      clock.tick(1000);

      assert.instanceOf(loadColumnEncryptionKeys([keyInfo(value)], options), Promise);
      assert.lengthOf(provider.calls, 2);
    });

    it('applies an idle timeout that the key store provider changed, from the next use of a key on', async function() {
      const clock = sinon.useFakeTimers();
      const value = keyValue();
      const options = optionsWith({ keyCacheIdleTimeout: 5000 });

      await loadColumnEncryptionKeys([keyInfo(value)], options);

      await clock.tickAsync(500);
      provider.keyCacheIdleTimeout = 1000;
      assert.instanceOf(loadColumnEncryptionKeys([keyInfo(value)], options), Map);

      await clock.tickAsync(999);
      assert.lengthOf(provider.calls, 1);

      await clock.tickAsync(1);
      assert.isFalse(isCached(value));
    });

    it('keeps keys that are not used if there is no idle timeout', async function() {
      const clock = sinon.useFakeTimers();
      const value = keyValue();
      const options = optionsWith({ keyCacheIdleTimeout: 0, keyCacheTTL: 10 * 60 * 60 * 1000 });

      await loadColumnEncryptionKeys([keyInfo(value)], options);

      await clock.tickAsync(9 * 60 * 60 * 1000);
      assert.instanceOf(loadColumnEncryptionKeys([keyInfo(value)], options), Map);
      assert.lengthOf(provider.calls, 1);
    });

    it('does not keep the process running for a key that is to be removed', async function() {
      const setTimeoutSpy = sinon.spy(global, 'setTimeout');

      await loadColumnEncryptionKeys([keyInfo(keyValue())], optionsWith({ keyCacheIdleTimeout: 60000 }));

      const timers = setTimeoutSpy.returnValues.filter((timer, index) => setTimeoutSpy.args[index][1] === 60000);
      assert.lengthOf(timers, 1);
      assert.isFalse(timers[0].hasRef());

      clearTimeout(timers[0]);
    });

    it('does not remove a key while the key store is decrypting it', async function() {
      const clock = sinon.useFakeTimers();
      const value = keyValue();
      const options = optionsWith({ keyCacheIdleTimeout: 1000 });

      let resolveKey!: (key: Buffer) => void;
      provider.decryptColumnEncryptionKey = (masterKeyPath, encryptionAlgorithm, encryptedColumnEncryptionKey) => {
        provider.calls.push({ masterKeyPath, encryptionAlgorithm, encryptedColumnEncryptionKey });
        return new Promise<Buffer>((resolve) => {
          resolveKey = resolve;
        });
      };

      const first = loadColumnEncryptionKeys([keyInfo(value)], options);
      await clock.tickAsync(0);

      // The key store takes longer than the idle timeout.
      await clock.tickAsync(5000);

      // A request that needs the key meanwhile waits for the same result.
      const second = loadColumnEncryptionKeys([keyInfo(value)], options);
      assert.instanceOf(second, Promise);
      assert.lengthOf(provider.calls, 1);

      resolveKey(value.encryptedKey);
      await Promise.all([first, second]);

      // The key was kept, and its idle timeout starts once it is available.
      assert.instanceOf(loadColumnEncryptionKeys([keyInfo(value)], options), Map);
      assert.lengthOf(provider.calls, 1);

      await clock.tickAsync(1000);
      assert.isFalse(isCached(value));
    });
  });

  it('checks the key cache options of a provider each time a key is looked up', async function() {
    const value = keyValue();
    const options = optionsWith();

    await loadColumnEncryptionKeys([keyInfo(value)], options);

    // The options were valid when the connection was created.
    provider.keyCacheTTL = -1;

    assert.throws(() => loadColumnEncryptionKeys([keyInfo(value)], options), TypeError, 'The "config.options.columnEncryption.keyStoreProviders.FAKE.keyCacheTTL" property must be a non-negative number.');
    assert.throws(() => loadColumnEncryptionKeys([keyInfo(keyValue())], options), TypeError, 'keyCacheTTL');
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
