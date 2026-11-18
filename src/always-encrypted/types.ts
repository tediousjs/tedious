import { type ColumnEncryptionKeyStoreProvider } from './key-store-provider';

/**
 * Options for Always Encrypted, see {@link ConnectionOptions.columnEncryption}.
 */
export interface ColumnEncryptionOptions {
  /**
   * The key store providers that give access to the column master keys, by
   * the provider name the column master keys were created with in the
   * database (`KEY_STORE_PROVIDER_NAME`), e.g. `AZURE_KEY_VAULT`.
   *
   * See {@link AzureKeyVaultKeyStoreProvider} and {@link RsaKeyStoreProvider}
   * for the providers that come with `tedious`. Any object that implements
   * {@link ColumnEncryptionKeyStoreProvider} can be used to support other
   * key stores.
   */
  keyStoreProviders: { [providerName: string]: ColumnEncryptionKeyStoreProvider };

  /**
   * The number of milliseconds a decrypted column encryption key is kept in
   * memory, so the key store is not accessed for every request that uses
   * the key. `0` disables the cache.
   *
   * Keys are cached per key store provider instance and server: connections
   * to the same server that share a provider instance share its decrypted
   * keys, each for as long as its own option allows.
   *
   * (default: `7200000`, 2 hours)
   */
  keyCacheTTL?: number | undefined;

  /**
   * The number of milliseconds after which a decrypted column encryption
   * key that was not used in the meantime is removed from memory. With `0`,
   * a key is kept for as long as `keyCacheTTL` allows, used or not.
   *
   * `keyCacheTTL` limits for how long a key is used before the key store is
   * asked for it again, however often it is used. This limits for how long
   * a key that is not used stays around: it is removed when the time is up,
   * not when it is asked for the next time.
   *
   * A key that connections share (see `keyCacheTTL`) is removed once it was
   * not used for the shortest idle timeout of the connections that used
   * it. A result set that is being read holds on to its keys until it was
   * read. Removing a key lets go of it, which does not guarantee that the
   * memory that held it is overwritten right away.
   *
   * (default: `900000`, 15 minutes)
   */
  keyCacheIdleTimeout?: number | undefined;

  /**
   * The key paths of the column master keys the server is trusted to refer
   * to. If set, column encryption keys that are protected by any other
   * column master key are rejected.
   *
   * Without it, a compromised server can make the application use any key
   * its key store providers have access to.
   *
   * (default: all key paths are trusted)
   */
  trustedKeyPaths?: readonly string[] | undefined;

  /**
   * The number of statements a connection remembers the parameter
   * encryption metadata of, which saves asking the server for it each time
   * such a statement is executed. `0` disables the cache.
   *
   * A statement is remembered by its text and the names of its parameters,
   * whatever their types and values are.
   *
   * (default: `1000`)
   */
  parameterMetadataCacheSize?: number | undefined;
}

/**
 * The validated and defaulted {@link ColumnEncryptionOptions}.
 *
 * @private
 */
export interface InternalColumnEncryptionOptions {
  keyStoreProviders: Map<string, ColumnEncryptionKeyStoreProvider>;
  keyCacheTTL: number;
  keyCacheIdleTimeout: number;
  // Lower cased
  trustedKeyPaths: Set<string> | undefined;
  parameterMetadataCacheSize: number;

  // Identifies the server that the connection is made to: decrypted column
  // encryption keys are cached per server. Lower cased.
  serverName: string;
}

/**
 * How a statement makes use of Always Encrypted, see {@link RequestOptions.columnEncryption}.
 */
export type RequestColumnEncryption = 'enabled' | 'resultSetOnly' | 'disabled';

/**
 * A column encryption key as it is stored in the database: encrypted with
 * a column master key.
 */
export interface EncryptedColumnEncryptionKey {
  /**
   * The encrypted column encryption key.
   */
  encryptedKey: Buffer;

  /**
   * The name of the key store provider of the key store that holds the
   * column master key.
   */
  keyStoreName: string;

  /**
   * The path of the column master key in its key store.
   */
  keyPath: string;

  /**
   * The algorithm the column encryption key was encrypted with.
   */
  algorithm: string;
}

/**
 * The version of the column encryption feature that is asked for when
 * logging in: column encryption without the use of secure enclaves (which
 * would be version 2 and above).
 *
 * @private
 */
export const COLUMN_ENCRYPTION_VERSION = 1;

/**
 * Describes a column encryption key.
 */
export interface ColumnEncryptionKeyInfo {
  /**
   * The id of the database that the key is defined in.
   */
  databaseId: number;

  /**
   * The id of the key in its database, the `column_encryption_key_id` of
   * `sys.column_encryption_keys`.
   */
  keyId: number;

  /**
   * The version of the key. Reserved by the server, always `1` so far.
   */
  keyVersion: number;

  /**
   * The version of the key's metadata: an opaque value of 8 bytes, which
   * is passed back to the server along with encrypted parameters.
   */
  metadataVersion: Buffer;

  /**
   * The encrypted values of the key - one per column master key that
   * protects it. There is more than one while a column master key is being
   * rotated.
   */
  values: EncryptedColumnEncryptionKey[];
}

/**
 * How the values of a column are encrypted.
 *
 * - `'deterministic'`: equal values are encrypted to equal ciphertexts,
 *   which allows the server to look up, join and group by them.
 * - `'randomized'`: each value is encrypted to a different ciphertext.
 */
export type EncryptionType = 'deterministic' | 'randomized';

/**
 * Describes how the values of a column (or of a parameter) are encrypted.
 */
export interface CryptoMetadata {
  /**
   * The column encryption key the values are encrypted with.
   *
   * Not available for output parameters.
   */
  key: ColumnEncryptionKeyInfo | undefined;

  /**
   * Whether equal values are encrypted to equal ciphertexts.
   */
  encryptionType: EncryptionType;

  /**
   * The id of the encryption algorithm. `2` is `AEAD_AES_256_CBC_HMAC_SHA256`.
   */
  algorithmId: number;

  /**
   * The name of the encryption algorithm, if it is a custom one.
   */
  algorithmName: string | undefined;

  /**
   * The version of the rules that values are brought into the form by
   * that is encrypted. `1` is the only version there is.
   */
  normalizationRuleVersion: number;
}

export function encryptionTypeFromId(id: number): EncryptionType {
  switch (id) {
    case 1:
      return 'deterministic';
    case 2:
      return 'randomized';
    default:
      throw new Error(`Unsupported column encryption type ${id}`);
  }
}
