import { ALGORITHM_ID, ALGORITHM_NAME, ColumnEncryptionCipher } from './cipher';
import { type ColumnEncryptionKeyStoreProvider } from './key-store-provider';
import { type ColumnEncryptionKeyInfo, type EncryptedColumnEncryptionKey, type InternalColumnEncryptionOptions } from './types';

interface CacheEntry {
  // Set once the key was decrypted.
  cipher: ColumnEncryptionCipher | undefined;
  promise: Promise<ColumnEncryptionCipher>;

  // When the key store was asked for the key. How long the entry is of use
  // from then on is up to each of the connections that share the cache.
  time: number;
}

// Decrypted column encryption keys are cached per key store provider: what a
// provider decrypted once can be used by every connection that trusts the
// same provider instance, and is released together with the provider.
const caches = new WeakMap<ColumnEncryptionKeyStoreProvider, Map<string, CacheEntry>>();

/**
 * Makes sure that the `cipher` of each of the given column encryption keys
 * is available, decrypting the keys via their key store providers as
 * needed.
 *
 * Only returns a promise if a key store actually has to be accessed, so no
 * time is lost waiting when all keys are cached.
 */
export function loadColumnEncryptionKeys(keys: ColumnEncryptionKeyInfo[], options: InternalColumnEncryptionOptions): void | Promise<void> {
  let pending: Promise<void>[] | undefined;

  for (const key of keys) {
    // Looked up again even if the key already has a cipher (as the keys of
    // cached parameter metadata do), so that the lifetime of the key cache
    // applies to them, too.
    const cipher = getCipher(key, options);
    if (cipher instanceof ColumnEncryptionCipher) {
      key.cipher = cipher;
    } else {
      (pending ??= []).push(cipher.then((cipher) => {
        key.cipher = cipher;
      }));
    }
  }

  if (pending !== undefined) {
    return Promise.all(pending).then(() => {});
  }
}

// The only version of the rules that values are normalized by before they
// are encrypted.
const NORMALIZATION_RULE_VERSION = 1;

/**
 * Throws if values can not be encrypted or decrypted the way the server
 * asks for.
 */
export function assertSupportedEncryption({ algorithmId, algorithmName, normalizationRuleVersion }: { algorithmId: number, algorithmName?: string | undefined, normalizationRuleVersion: number }) {
  if (algorithmId !== ALGORITHM_ID) {
    throw new Error(`Unsupported column encryption algorithm ${algorithmName !== undefined ? `"${algorithmName}"` : algorithmId}, only "${ALGORITHM_NAME}" is supported.`);
  }

  if (normalizationRuleVersion !== NORMALIZATION_RULE_VERSION) {
    throw new Error(`Unsupported column encryption normalization rule version ${normalizationRuleVersion}, only version ${NORMALIZATION_RULE_VERSION} is supported.`);
  }
}

/**
 * Returns the cipher of a column encryption key, right away if one of the
 * key's encrypted values was decrypted before.
 */
function getCipher(key: ColumnEncryptionKeyInfo, options: InternalColumnEncryptionOptions): ColumnEncryptionCipher | Promise<ColumnEncryptionCipher> {
  const now = Date.now();

  for (const value of key.values) {
    const provider = options.keyStoreProviders.get(value.keyStoreName);
    if (provider !== undefined && isTrustedKeyPath(value.keyPath, options)) {
      const entry = caches.get(provider)?.get(cacheKey(value));
      if (entry !== undefined && entry.cipher !== undefined && now - entry.time < options.keyCacheTTL) {
        return entry.cipher;
      }
    }
  }

  return decryptColumnEncryptionKey(key, options);
}

/**
 * Decrypts a column encryption key using the first of its encrypted values
 * that a key store provider is able to decrypt.
 */
async function decryptColumnEncryptionKey(key: ColumnEncryptionKeyInfo, options: InternalColumnEncryptionOptions): Promise<ColumnEncryptionCipher> {
  let firstError: unknown;

  for (const value of key.values) {
    try {
      return await decryptValue(value, options);
    } catch (error) {
      firstError ??= error;
    }
  }

  throw firstError ?? new Error('The server did not send any encrypted values for the column encryption key.');
}

function decryptValue(value: EncryptedColumnEncryptionKey, options: InternalColumnEncryptionOptions): Promise<ColumnEncryptionCipher> {
  const provider = options.keyStoreProviders.get(value.keyStoreName);
  if (provider === undefined) {
    const registered = Array.from(options.keyStoreProviders.keys(), (name) => `"${name}"`).join(', ') || 'none';
    throw new Error(`No key store provider is registered for the key store "${value.keyStoreName}" of the column master key "${value.keyPath}". Registered key store providers: ${registered}.`);
  }

  if (!isTrustedKeyPath(value.keyPath, options)) {
    throw new Error(`The column master key path "${value.keyPath}" is not one of the trusted key paths.`);
  }

  if (options.keyCacheTTL <= 0) {
    return decryptWithProvider(provider, value);
  }

  let cache = caches.get(provider);
  if (cache === undefined) {
    cache = new Map();
    caches.set(provider, cache);
  }

  const now = Date.now();
  const key = cacheKey(value);

  const cached = cache.get(key);
  if (cached !== undefined && now - cached.time < options.keyCacheTTL) {
    // Requests that need the key while it is being decrypted wait for the
    // same result, instead of each accessing the key store.
    return cached.promise;
  }

  // Entries that are of no use to this connection anymore are dropped, to
  // not keep keys around that are not used any longer.
  for (const [key, entry] of cache) {
    if (now - entry.time >= options.keyCacheTTL) {
      cache.delete(key);
    }
  }

  const entry: CacheEntry = { cipher: undefined, promise: decryptWithProvider(provider, value), time: now };
  cache.set(key, entry);

  entry.promise.then((cipher) => {
    entry.cipher = cipher;
  }, () => {
    if (cache.get(key) === entry) {
      cache.delete(key);
    }
  });

  return entry.promise;
}

async function decryptWithProvider(provider: ColumnEncryptionKeyStoreProvider, value: EncryptedColumnEncryptionKey): Promise<ColumnEncryptionCipher> {
  let columnEncryptionKey;
  try {
    columnEncryptionKey = await provider.decryptColumnEncryptionKey(value.keyPath, value.algorithm, value.encryptedKey);
  } catch (error: any) {
    throw new Error(`The key store provider "${value.keyStoreName}" failed to decrypt a column encryption key with the column master key "${value.keyPath}": ${error?.message ?? error}`, { cause: error });
  }

  if (!(columnEncryptionKey instanceof Uint8Array)) {
    throw new Error(`The key store provider "${value.keyStoreName}" did not return the decrypted column encryption key as a Buffer or Uint8Array.`);
  }

  return new ColumnEncryptionCipher(Buffer.from(columnEncryptionKey.buffer, columnEncryptionKey.byteOffset, columnEncryptionKey.byteLength));
}

function isTrustedKeyPath(keyPath: string, options: InternalColumnEncryptionOptions): boolean {
  return options.trustedKeyPaths === undefined || options.trustedKeyPaths.has(keyPath.toLowerCase());
}

function cacheKey(value: EncryptedColumnEncryptionKey): string {
  return `${value.keyPath}\n${value.algorithm}\n${value.encryptedKey.toString('base64')}`;
}
