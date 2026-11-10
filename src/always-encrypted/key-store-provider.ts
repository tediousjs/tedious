import { constants, createHash, createPrivateKey, KeyObject, privateDecrypt, publicEncrypt, sign, verify } from 'crypto';

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
 */
export interface ColumnEncryptionKeyStoreProvider {
  /**
   * Decrypts a column encryption key with a column master key.
   *
   * The result is cached (see {@link ColumnEncryptionOptions.keyCacheTTL}),
   * so this is only called when a key is used for the first time, or once
   * its cache entry expired.
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
  declare private readonly lookup: (masterKeyPath: string) => RsaPrivateKey | undefined | Promise<RsaPrivateKey | undefined>;
  declare private readonly keys: Map<string, KeyObject>;

  /**
   * @param keys
   *   The private keys of the column master keys by key path, or a function
   *   that looks up the private key of a key path. Key paths in an object
   *   are matched case-insensitively. The result of a lookup is cached.
   */
  constructor(keys: { [masterKeyPath: string]: RsaPrivateKey } | ((masterKeyPath: string) => RsaPrivateKey | undefined | Promise<RsaPrivateKey | undefined>)) {
    if (typeof keys === 'function') {
      this.lookup = keys;
    } else if (typeof keys === 'object' && keys !== null) {
      const byPath = new Map(Object.entries(keys).map(([masterKeyPath, key]) => [masterKeyPath.toLowerCase(), key]));
      this.lookup = (masterKeyPath) => byPath.get(masterKeyPath.toLowerCase());
    } else {
      throw new TypeError('The "keys" argument must be of type object or function.');
    }

    this.keys = new Map();
  }

  async decryptColumnEncryptionKey(masterKeyPath: string, encryptionAlgorithm: string, encryptedColumnEncryptionKey: Buffer): Promise<Buffer> {
    assertKeyEncryptionAlgorithm(encryptionAlgorithm);

    const privateKey = await this.getPrivateKey(masterKeyPath);
    const { ciphertext, signature, signedData } = parseKeyEnvelope(encryptedColumnEncryptionKey);

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
    let privateKey = this.keys.get(masterKeyPath);

    if (privateKey === undefined) {
      const key = await this.lookup(masterKeyPath);
      if (key == null) {
        throw new Error(`No private key is available for the column master key "${masterKeyPath}".`);
      }

      privateKey = key instanceof KeyObject ? key : createPrivateKey(key);
      if (privateKey.type !== 'private' || privateKey.asymmetricKeyType !== 'rsa') {
        throw new Error(`The key of the column master key "${masterKeyPath}" is not a private RSA key.`);
      }

      this.keys.set(masterKeyPath, privateKey);
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
  unwrapKey(algorithm: 'RSA-OAEP', encryptedKey: Uint8Array): Promise<{ result: Uint8Array }>;
  verify(algorithm: 'RS256', digest: Uint8Array, signature: Uint8Array): Promise<{ result: boolean }>;

  wrapKey?(algorithm: 'RSA-OAEP', key: Uint8Array): Promise<{ result: Uint8Array }>;
  sign?(algorithm: 'RS256', digest: Uint8Array): Promise<{ result: Uint8Array }>;
}

export interface AzureKeyVaultKeyStoreProviderOptions {
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

  declare private readonly createCryptographyClient: (keyId: string) => AzureKeyVaultCryptographyClient;
  declare private readonly trustedEndpoints: readonly string[];
  declare private readonly clients: Map<string, AzureKeyVaultCryptographyClient>;

  /**
   * @param createCryptographyClient
   *   Creates the client for the key with the given key identifier (the URL
   *   of the key, which is the key path of the column master key). Called
   *   once per key.
   */
  constructor(createCryptographyClient: (keyId: string) => AzureKeyVaultCryptographyClient, options?: AzureKeyVaultKeyStoreProviderOptions) {
    if (typeof createCryptographyClient !== 'function') {
      throw new TypeError('The "createCryptographyClient" argument must be of type function.');
    }

    const trustedEndpoints = options?.trustedEndpoints ?? AzureKeyVaultKeyStoreProvider.DEFAULT_TRUSTED_ENDPOINTS;
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
    const { ciphertext, signature, signedData } = parseKeyEnvelope(encryptedColumnEncryptionKey);

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
