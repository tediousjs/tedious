import { type ColumnEncryptionCipher } from './cipher';
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
   * Keys are cached per key store provider instance: connections that
   * share a provider instance share its decrypted keys.
   *
   * (default: `7200000`, 2 hours)
   */
  keyCacheTTL?: number | undefined;

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
  // Lower cased
  trustedKeyPaths: Set<string> | undefined;
  parameterMetadataCacheSize: number;
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
 * Describes a column encryption key.
 */
export interface ColumnEncryptionKeyInfo {
  databaseId: number;
  keyId: number;
  keyVersion: number;
  metadataVersion: Buffer;

  /**
   * The encrypted values of the key - one per column master key that
   * protects it. There is more than one while a column master key is being
   * rotated.
   */
  values: EncryptedColumnEncryptionKey[];

  /**
   * The cipher for the values encrypted with this key, once the key was
   * decrypted.
   *
   * @private
   */
  cipher: ColumnEncryptionCipher | undefined;

  /**
   * Set if a value could not be decrypted with the key. The cipher is
   * removed then, and values are left encrypted from there on.
   *
   * @private
   */
  error?: Error | undefined;
}

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

  encryptionType: EncryptionType;

  /**
   * The id of the encryption algorithm. `2` is `AEAD_AES_256_CBC_HMAC_SHA256`.
   */
  algorithmId: number;

  /**
   * The name of the encryption algorithm, if it is a custom one.
   */
  algorithmName: string | undefined;

  normalizationRuleVersion: number;

  /**
   * Whether the encrypted values are sent as PLP values (`varbinary(max)`).
   *
   * @private
   */
  isPLP: boolean;
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
