import { constants, createHash, createPrivateKey, KeyObject, privateDecrypt, publicEncrypt, sign, verify } from 'crypto';

/**
 * For how long a decrypted column encryption key is used, if its key store
 * provider does not say.
 */
export const DEFAULT_KEY_CACHE_TTL = 2 * 60 * 60 * 1000;

/**
 * For how long a decrypted column encryption key that is not used is kept,
 * if its key store provider does not say.
 */
export const DEFAULT_KEY_CACHE_IDLE_TIMEOUT = 15 * 60 * 1000;

// The longest that a timer can be set for.
const MAX_TIMEOUT = 2 ** 31 - 1;

/**
 * How long the column encryption keys that a key store provider decrypted
 * are kept in memory.
 */
export interface KeyCacheOptions {
  /**
   * The number of milliseconds a decrypted column encryption key is used
   * for, before the key store is asked for it again. Keeping keys saves
   * accessing the key store for every request that uses them. `0` does not
   * keep keys at all.
   *
   * (default: `7200000`, 2 hours)
   */
  keyCacheTTL?: number | undefined;

  /**
   * The number of milliseconds after which a decrypted column encryption
   * key that was not used in the meantime is removed from memory. With `0`,
   * a key is kept for as long as `keyCacheTTL` allows, used or not.
   *
   * `keyCacheTTL` limits for how long a key is used, however often that
   * is. This limits for how long a key that is not used stays around: it
   * is removed when the time is up, not when it is asked for the next time.
   *
   * A result set that is being read holds on to its keys until it was
   * read. Removing a key lets go of it, which does not guarantee that the
   * memory that held it is overwritten right away.
   *
   * (default: `900000`, 15 minutes)
   */
  keyCacheIdleTimeout?: number | undefined;
}

/**
 * Throws a `TypeError` if the key cache options of a key store provider
 * are not valid.
 *
 * @param name
 *   What the options are referred to as in the error.
 */
export function validateKeyCacheOptions({ keyCacheTTL, keyCacheIdleTimeout }: KeyCacheOptions, name: string) {
  if (keyCacheTTL !== undefined && (typeof keyCacheTTL !== 'number' || !(keyCacheTTL >= 0))) {
    throw new TypeError(`The "${name}.keyCacheTTL" property must be a non-negative number.`);
  }

  if (keyCacheIdleTimeout !== undefined && (typeof keyCacheIdleTimeout !== 'number' || !(keyCacheIdleTimeout >= 0 && keyCacheIdleTimeout <= MAX_TIMEOUT))) {
    throw new TypeError(`The "${name}.keyCacheIdleTimeout" property must be a number between 0 and ${MAX_TIMEOUT}.`);
  }
}

/**
 * A key store provider gives access to the column master keys of a key
 * store, which protect the column encryption keys stored in the database.
 *
 * Providers are registered via {@link ColumnEncryptionOptions.keyStoreProviders},
 * under the provider name the column master keys were created with in the
 * database (`KEY_STORE_PROVIDER_NAME`).
 *
 * The method names and arguments match those of the key store providers of
 * Microsoft's drivers.
 *
 * The column encryption keys that a provider decrypted are kept in memory,
 * for the connections that use the same provider instance and are made to
 * the same server. For how long is up to the provider: see
 * {@link KeyCacheOptions.keyCacheTTL} and
 * {@link KeyCacheOptions.keyCacheIdleTimeout}, which a provider can have as
 * properties.
 */
export interface ColumnEncryptionKeyStoreProvider extends KeyCacheOptions {
  /**
   * Decrypts a column encryption key with a column master key.
   *
   * The result is kept (see {@link KeyCacheOptions.keyCacheTTL}), so this
   * is only called when a key is used for the first time, or once it is
   * not kept anymore.
   *
   * @param masterKeyPath
   *   The path of the column master key (`KEY_PATH`), in a format specific
   *   to the key store.
   *
   * @param encryptionAlgorithm
   *   The algorithm the column encryption key was encrypted with, e.g.
   *   `RSA_OAEP`.
   *
   * @param encryptedColumnEncryptionKey
   *   The encrypted column encryption key, as stored in the database
   *   (`ENCRYPTED_VALUE`).
   *
   * @returns
   *   The plaintext column encryption key.
   */
  decryptColumnEncryptionKey(masterKeyPath: string, encryptionAlgorithm: string, encryptedColumnEncryptionKey: Buffer): Uint8Array | Promise<Uint8Array>;

  /**
   * Encrypts a column encryption key with a column master key.
   *
   * This is what creates the `ENCRYPTED_VALUE` of a new column encryption
   * key (`CREATE COLUMN ENCRYPTION KEY`), or of an existing one for another
   * column master key (`ALTER COLUMN ENCRYPTION KEY`). It is for the tools
   * that set up and rotate keys: `tedious` itself never calls it, and a
   * provider that is only used to read and write encrypted values does not
   * have to implement it.
   *
   * @param masterKeyPath
   *   The path of the column master key (`KEY_PATH`).
   *
   * @param encryptionAlgorithm
   *   The algorithm to encrypt the column encryption key with, e.g.
   *   `RSA_OAEP`.
   *
   * @param columnEncryptionKey
   *   The plaintext column encryption key.
   *
   * @returns
   *   The encrypted column encryption key.
   */
  encryptColumnEncryptionKey?(masterKeyPath: string, encryptionAlgorithm: string, columnEncryptionKey: Uint8Array): Uint8Array | Promise<Uint8Array>;
}

// All of Microsoft's key store providers (`MSSQL_CERTIFICATE_STORE`,
// `MSSQL_CNG_STORE`, `MSSQL_CSP_PROVIDER`, `MSSQL_JAVA_KEYSTORE` and
// `AZURE_KEY_VAULT`) store an encrypted column encryption key in the same
// envelope:
//
//   version (1 byte) | key path length (2 bytes) | ciphertext length (2 bytes)
//     | key path (UTF-16LE, lower case) | ciphertext | signature
//
// The ciphertext is the column encryption key, encrypted with RSA-OAEP
// (SHA-1). The signature is an RSASSA-PKCS1-v1_5 (SHA-256) signature over
// everything that precedes it, made with the same column master key.
const ENVELOPE_VERSION = 0x01;
const ENVELOPE_HEADER_LENGTH = 5;

const KEY_ENCRYPTION_ALGORITHM = 'RSA_OAEP';

interface KeyEnvelope {
  ciphertext: Buffer;
  signature: Buffer;

  /**
   * The part of the envelope covered by the signature.
   */
  signedData: Buffer;
}

function assertKeyEncryptionAlgorithm(encryptionAlgorithm: string) {
  if (typeof encryptionAlgorithm !== 'string' || encryptionAlgorithm.toUpperCase() !== KEY_ENCRYPTION_ALGORITHM) {
    throw new Error(`Unsupported column encryption key encryption algorithm "${encryptionAlgorithm}", only "${KEY_ENCRYPTION_ALGORITHM}" is supported.`);
  }
}

function parseKeyEnvelope(encryptedColumnEncryptionKey: Buffer): KeyEnvelope {
  if (encryptedColumnEncryptionKey.length < ENVELOPE_HEADER_LENGTH) {
    throw new Error('The encrypted column encryption key is too short.');
  }

  if (encryptedColumnEncryptionKey[0] !== ENVELOPE_VERSION) {
    throw new Error(`The encrypted column encryption key has an unsupported version 0x${encryptedColumnEncryptionKey[0].toString(16).padStart(2, '0')}.`);
  }

  const keyPathLength = encryptedColumnEncryptionKey.readUInt16LE(1);
  const ciphertextLength = encryptedColumnEncryptionKey.readUInt16LE(3);

  const ciphertextOffset = ENVELOPE_HEADER_LENGTH + keyPathLength;
  const signatureOffset = ciphertextOffset + ciphertextLength;
  if (ciphertextLength === 0 || signatureOffset >= encryptedColumnEncryptionKey.length) {
    throw new Error('The encrypted column encryption key is malformed.');
  }

  return {
    ciphertext: encryptedColumnEncryptionKey.subarray(ciphertextOffset, signatureOffset),
    signature: encryptedColumnEncryptionKey.subarray(signatureOffset),
    signedData: encryptedColumnEncryptionKey.subarray(0, signatureOffset)
  };
}

/**
 * Builds the part of the envelope that is covered by the signature.
 */
function buildSignedData(masterKeyPath: string, ciphertext: Uint8Array): Buffer {
  const keyPath = Buffer.from(masterKeyPath.toLowerCase(), 'utf16le');

  const header = Buffer.alloc(ENVELOPE_HEADER_LENGTH);
  header.writeUInt8(ENVELOPE_VERSION, 0);
  header.writeUInt16LE(keyPath.length, 1);
  header.writeUInt16LE(ciphertext.length, 3);

  return Buffer.concat([header, keyPath, ciphertext]);
}

/**
 * The ciphertext and the signature of an encrypted column encryption key
 * are both as long as the RSA key they were made with. Checked before the
 * key store is asked to make use of them.
 *
 * @param keyLength
 *   The length of the column master key in bytes, if it is known.
 */
function assertKeyLengths({ ciphertext, signature }: KeyEnvelope, masterKeyPath: string, keyLength?: number) {
  const expected = keyLength ?? signature.length;
  const expectation = keyLength !== undefined ? `the column master key "${masterKeyPath}" is ${keyLength} bytes long` : `its signature is ${signature.length} bytes long`;

  if (ciphertext.length !== expected) {
    throw new Error(`The encrypted column encryption key is malformed: its ciphertext is ${ciphertext.length} bytes long, but ${expectation}.`);
  }

  if (signature.length !== expected) {
    throw new Error(`The encrypted column encryption key is malformed: its signature is ${signature.length} bytes long, but ${expectation}.`);
  }
}

function invalidSignatureMessage(masterKeyPath: string) {
  return `The signature of the encrypted column encryption key does not match the column master key "${masterKeyPath}". The encrypted column encryption key may be corrupt, or the column master key may be the wrong one.`;
}

/**
 * A private RSA key, in any form accepted by Node.js'
 * [`crypto.createPrivateKey`](https://nodejs.org/api/crypto.html#cryptocreateprivatekeykey):
 * e.g. a PEM encoded string, or a `KeyObject`.
 */
export type RsaPrivateKey = Parameters<typeof createPrivateKey>[0] | KeyObject;

/**
 * A key store provider for RSA column master keys that are available to
 * the application itself, like keys read from PEM files or from a secret
 * store.
 *
 * It reads (and writes) the same format as the certificate based key store
 * providers of Microsoft's drivers. Registering it as
 * `MSSQL_CERTIFICATE_STORE` or `MSSQL_JAVA_KEYSTORE` thus allows using
 * column master keys that were exported from a Windows certificate store or
 * a Java key store.
 *
 * ```js
 * const provider = new RsaKeyStoreProvider({
 *   'CurrentUser/My/F2260F28C9C2F67DE4D8B7F5F2F3A2C9A3F1B5D1': fs.readFileSync('./column-master-key.pem')
 * });
 * ```
 */
export class RsaKeyStoreProvider implements ColumnEncryptionKeyStoreProvider {
  declare readonly keyCacheTTL: number | undefined;
  declare readonly keyCacheIdleTimeout: number | undefined;

  declare private readonly lookup: (masterKeyPath: string) => RsaPrivateKey | undefined | Promise<RsaPrivateKey | undefined>;

  /**
   * @param keys
   *   The private keys of the column master keys by key path, or a function
   *   that looks up the private key of a key path.
   *
   *   Key paths in an object are matched case-insensitively. The keys of
   *   an object are held on to for as long as the provider is.
   *
   *   A function is called each time a column encryption key is decrypted
   *   (which {@link KeyCacheOptions.keyCacheTTL} limits), and what it
   *   returns is not held on to. That leaves it to the function how long a
   *   private key is kept in memory, and lets it return another key once
   *   the key of a path changed.
   *
   * @param options
   *   How long the column encryption keys that the provider decrypted are
   *   kept in memory, see {@link KeyCacheOptions}.
   */
  constructor(keys: { [masterKeyPath: string]: RsaPrivateKey } | ((masterKeyPath: string) => RsaPrivateKey | undefined | Promise<RsaPrivateKey | undefined>), options: KeyCacheOptions = {}) {
    if (typeof keys === 'function') {
      this.lookup = keys;
    } else if (typeof keys === 'object' && keys !== null) {
      const byPath = new Map(Object.entries(keys).map(([masterKeyPath, key]) => [masterKeyPath.toLowerCase(), key]));
      this.lookup = (masterKeyPath) => byPath.get(masterKeyPath.toLowerCase());
    } else {
      throw new TypeError('The "keys" argument must be of type object or function.');
    }

    if (typeof options !== 'object' || options === null) {
      throw new TypeError('The "options" argument must be of type object.');
    }

    validateKeyCacheOptions(options, 'options');
    this.keyCacheTTL = options.keyCacheTTL;
    this.keyCacheIdleTimeout = options.keyCacheIdleTimeout;
  }

  async decryptColumnEncryptionKey(masterKeyPath: string, encryptionAlgorithm: string, encryptedColumnEncryptionKey: Buffer): Promise<Buffer> {
    assertKeyEncryptionAlgorithm(encryptionAlgorithm);

    const privateKey = await this.getPrivateKey(masterKeyPath);
    const envelope = parseKeyEnvelope(encryptedColumnEncryptionKey);
    assertKeyLengths(envelope, masterKeyPath, privateKey.asymmetricKeyDetails!.modulusLength! / 8);

    const { ciphertext, signature, signedData } = envelope;

    // The public key is derived from the private key.
    if (!verify('sha256', signedData, privateKey, signature)) {
      throw new Error(invalidSignatureMessage(masterKeyPath));
    }

    return privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' }, ciphertext);
  }

  /**
   * Encrypts a column encryption key with a column master key. The result
   * is the `ENCRYPTED_VALUE` of a `CREATE COLUMN ENCRYPTION KEY` statement.
   */
  async encryptColumnEncryptionKey(masterKeyPath: string, encryptionAlgorithm: string, columnEncryptionKey: Uint8Array): Promise<Buffer> {
    assertKeyEncryptionAlgorithm(encryptionAlgorithm);

    const privateKey = await this.getPrivateKey(masterKeyPath);

    const ciphertext = publicEncrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' }, columnEncryptionKey);
    const signedData = buildSignedData(masterKeyPath, ciphertext);

    return Buffer.concat([signedData, sign('sha256', signedData, privateKey)]);
  }

  private async getPrivateKey(masterKeyPath: string): Promise<KeyObject> {
    const key = await this.lookup(masterKeyPath);
    if (key == null) {
      throw new Error(`No private key is available for the column master key "${masterKeyPath}".`);
    }

    const privateKey = key instanceof KeyObject ? key : createPrivateKey(key);
    if (privateKey.type !== 'private' || privateKey.asymmetricKeyType !== 'rsa') {
      throw new Error(`The key of the column master key "${masterKeyPath}" is not a private RSA key.`);
    }

    return privateKey;
  }
}

/**
 * The operations of the `CryptographyClient` of the
 * [`@azure/keyvault-keys`](https://www.npmjs.com/package/@azure/keyvault-keys)
 * package that the {@link AzureKeyVaultKeyStoreProvider} uses.
 *
 * `wrapKey` and `sign` are only needed to encrypt new column encryption keys.
 */
export interface AzureKeyVaultCryptographyClient {
  /**
   * Decrypts a column encryption key with the column master key.
   */
  unwrapKey(algorithm: 'RSA-OAEP', encryptedKey: Uint8Array): Promise<{ result: Uint8Array }>;

  /**
   * Verifies the signature of an encrypted column encryption key, given
   * the SHA-256 digest of what was signed.
   */
  verify(algorithm: 'RS256', digest: Uint8Array, signature: Uint8Array): Promise<{ result: boolean }>;

  /**
   * Encrypts a column encryption key with the column master key. Only
   * used by {@link AzureKeyVaultKeyStoreProvider.encryptColumnEncryptionKey}.
   */
  wrapKey?(algorithm: 'RSA-OAEP', key: Uint8Array): Promise<{ result: Uint8Array }>;

  /**
   * Signs an encrypted column encryption key, given the SHA-256 digest of
   * what is to be signed. Only used by
   * {@link AzureKeyVaultKeyStoreProvider.encryptColumnEncryptionKey}.
   */
  sign?(algorithm: 'RS256', digest: Uint8Array): Promise<{ result: Uint8Array }>;
}

/**
 * The options of an {@link AzureKeyVaultKeyStoreProvider}.
 */
export interface AzureKeyVaultKeyStoreProviderOptions extends KeyCacheOptions {
  /**
   * The domain names column master keys are allowed to be stored at: the
   * host of a key path must be one of these, or a subdomain of one.
   *
   * Key paths are sent by the server, so this keeps a compromised server
   * from making the application use a key vault (and send its credentials
   * to an endpoint) of the server's choosing.
   *
   * Defaults to the Azure Key Vault and Managed HSM endpoints of the Azure
   * clouds, see {@link AzureKeyVaultKeyStoreProvider.DEFAULT_TRUSTED_ENDPOINTS}.
   */
  trustedEndpoints?: readonly string[];
}

/**
 * A key store provider for column master keys stored in Azure Key Vault (or
 * Azure Key Vault Managed HSM), the `AZURE_KEY_VAULT` key store.
 *
 * `tedious` does not depend on the Azure Key Vault client library itself.
 * Instead, the provider is given a function that creates a
 * `CryptographyClient` for a key, which also leaves the choice of
 * credentials and client options to the application:
 *
 * ```js
 * const { DefaultAzureCredential } = require('@azure/identity');
 * const { CryptographyClient } = require('@azure/keyvault-keys');
 *
 * const credential = new DefaultAzureCredential();
 * const provider = new AzureKeyVaultKeyStoreProvider((keyId) => new CryptographyClient(keyId, credential));
 * ```
 */
export class AzureKeyVaultKeyStoreProvider implements ColumnEncryptionKeyStoreProvider {
  /**
   * The key vault endpoints that column master keys are allowed to be
   * stored at by default.
   */
  static readonly DEFAULT_TRUSTED_ENDPOINTS: readonly string[] = Object.freeze([
    'vault.azure.net',
    'vault.azure.cn',
    'vault.usgovcloudapi.net',
    'vault.microsoftazure.de',
    'managedhsm.azure.net',
    'managedhsm.azure.cn',
    'managedhsm.usgovcloudapi.net',
    'managedhsm.microsoftazure.de'
  ]);

  declare readonly keyCacheTTL: number | undefined;
  declare readonly keyCacheIdleTimeout: number | undefined;

  declare private readonly createCryptographyClient: (keyId: string) => AzureKeyVaultCryptographyClient;
  declare private readonly trustedEndpoints: readonly string[];
  declare private readonly clients: Map<string, AzureKeyVaultCryptographyClient>;

  /**
   * @param createCryptographyClient
   *   Creates the client for the key with the given key identifier (the URL
   *   of the key, which is the key path of the column master key). Called
   *   once per key.
   *
   * @param options
   *   Which key vaults the provider is allowed to use, and how long the
   *   column encryption keys that it decrypted are kept in memory, see
   *   {@link AzureKeyVaultKeyStoreProviderOptions}.
   */
  constructor(createCryptographyClient: (keyId: string) => AzureKeyVaultCryptographyClient, options: AzureKeyVaultKeyStoreProviderOptions = {}) {
    if (typeof createCryptographyClient !== 'function') {
      throw new TypeError('The "createCryptographyClient" argument must be of type function.');
    }

    if (typeof options !== 'object' || options === null) {
      throw new TypeError('The "options" argument must be of type object.');
    }

    validateKeyCacheOptions(options, 'options');
    this.keyCacheTTL = options.keyCacheTTL;
    this.keyCacheIdleTimeout = options.keyCacheIdleTimeout;

    const trustedEndpoints = options.trustedEndpoints ?? AzureKeyVaultKeyStoreProvider.DEFAULT_TRUSTED_ENDPOINTS;
    if (!Array.isArray(trustedEndpoints) || !trustedEndpoints.every((endpoint) => typeof endpoint === 'string' && endpoint.length > 0)) {
      throw new TypeError('The "options.trustedEndpoints" property must be an array of domain names.');
    }

    this.createCryptographyClient = createCryptographyClient;
    this.trustedEndpoints = trustedEndpoints.map((endpoint) => endpoint.toLowerCase().replace(/^\./, ''));
    this.clients = new Map();
  }

  async decryptColumnEncryptionKey(masterKeyPath: string, encryptionAlgorithm: string, encryptedColumnEncryptionKey: Buffer): Promise<Buffer> {
    assertKeyEncryptionAlgorithm(encryptionAlgorithm);

    const client = this.getClient(masterKeyPath);
    const envelope = parseKeyEnvelope(encryptedColumnEncryptionKey);

    // The size of the key is only known to the key vault, but the two
    // parts that were made with it have to be of the same length.
    assertKeyLengths(envelope, masterKeyPath);

    const { ciphertext, signature, signedData } = envelope;

    const digest = createHash('sha256').update(signedData).digest();
    if (!(await client.verify('RS256', digest, signature)).result) {
      throw new Error(invalidSignatureMessage(masterKeyPath));
    }

    const { result } = await client.unwrapKey('RSA-OAEP', ciphertext);
    return Buffer.from(result.buffer, result.byteOffset, result.byteLength);
  }

  /**
   * Encrypts a column encryption key with a column master key. The result
   * is the `ENCRYPTED_VALUE` of a `CREATE COLUMN ENCRYPTION KEY` statement.
   */
  async encryptColumnEncryptionKey(masterKeyPath: string, encryptionAlgorithm: string, columnEncryptionKey: Uint8Array): Promise<Buffer> {
    assertKeyEncryptionAlgorithm(encryptionAlgorithm);

    const client = this.getClient(masterKeyPath);
    if (typeof client.wrapKey !== 'function' || typeof client.sign !== 'function') {
      throw new Error('The cryptography client needs to support `wrapKey` and `sign` to encrypt column encryption keys.');
    }

    const { result: ciphertext } = await client.wrapKey('RSA-OAEP', columnEncryptionKey);
    const signedData = buildSignedData(masterKeyPath, ciphertext);
    const { result: signature } = await client.sign('RS256', createHash('sha256').update(signedData).digest());

    return Buffer.concat([signedData, signature]);
  }

  private getClient(masterKeyPath: string): AzureKeyVaultCryptographyClient {
    let client = this.clients.get(masterKeyPath);

    if (client === undefined) {
      this.assertTrustedKeyPath(masterKeyPath);

      client = this.createCryptographyClient(masterKeyPath);
      this.clients.set(masterKeyPath, client);
    }

    return client;
  }

  private assertTrustedKeyPath(masterKeyPath: string) {
    let url;
    try {
      url = new URL(masterKeyPath);
    } catch {
      throw new Error(`The column master key path "${masterKeyPath}" is not a valid Azure Key Vault key identifier.`);
    }

    const hostname = url.hostname.toLowerCase();
    const trusted = url.protocol === 'https:' && this.trustedEndpoints.some((endpoint) => {
      return hostname === endpoint || hostname.endsWith('.' + endpoint);
    });

    if (!trusted) {
      throw new Error(`The column master key path "${masterKeyPath}" does not refer to a trusted Azure Key Vault endpoint. Trusted endpoints are: ${this.trustedEndpoints.join(', ')}.`);
    }
  }
}
