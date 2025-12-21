// This code is based on the `mssql-jdbc` library published under the conditions of MIT license.
// Copyright (c) 2019 Microsoft Corporation

/**
 * Interface for column encryption key store providers.
 *
 * Key store providers are responsible for:
 * - Decrypting column encryption keys (CEKs) that are encrypted with column master keys (CMKs)
 * - Optionally encrypting CEKs for key rotation scenarios
 *
 * Implementations of this interface can support various key stores such as:
 * - Azure Key Vault
 * - Windows Certificate Store
 * - Hardware Security Modules (HSMs)
 * - Custom key management solutions
 *
 * @example
 * ```typescript
 * class MyCustomKeyStoreProvider implements KeyStoreProvider {
 *   name = 'MY_CUSTOM_PROVIDER';
 *
 *   async decryptColumnEncryptionKey(
 *     masterKeyPath: string,
 *     encryptionAlgorithm: string,
 *     encryptedColumnEncryptionKey: Buffer
 *   ): Promise<Buffer> {
 *     // Decrypt the CEK using your custom key store
 *     return decryptedKey;
 *   }
 *
 *   async encryptColumnEncryptionKey(
 *     masterKeyPath: string,
 *     encryptionAlgorithm: string,
 *     columnEncryptionKey: Buffer
 *   ): Promise<Buffer> {
 *     // Encrypt the CEK using your custom key store
 *     return encryptedKey;
 *   }
 * }
 *
 * // Register the provider with the connection
 * const connection = new Connection({
 *   // ... other options
 *   options: {
 *     encryptionKeyStoreProviders: [
 *       new MyCustomKeyStoreProvider()
 *     ]
 *   }
 * });
 * ```
 */
export interface KeyStoreProvider {
  /**
   * The unique name of the key store provider.
   * This name is used to identify the provider in the column master key metadata.
   * Common names include:
   * - 'AZURE_KEY_VAULT' for Azure Key Vault
   * - 'MSSQL_CERTIFICATE_STORE' for Windows Certificate Store
   */
  readonly name: string;

  /**
   * Decrypts an encrypted column encryption key using the specified master key.
   *
   * This method is called by the driver when it needs to decrypt data from
   * encrypted columns. The encrypted CEK is stored in the database metadata
   * and must be decrypted using the column master key stored in the key store.
   *
   * @param masterKeyPath - The path/identifier of the column master key in the key store.
   *   For Azure Key Vault, this is the key URL (e.g., 'https://myvault.vault.azure.net/keys/mykey/version').
   *   For certificate stores, this is typically a certificate thumbprint or path.
   *
   * @param encryptionAlgorithm - The algorithm used to encrypt the CEK.
   *   Currently, SQL Server supports 'RSA_OAEP' for asymmetric key encryption.
   *
   * @param encryptedColumnEncryptionKey - The encrypted column encryption key bytes
   *   as stored in the database metadata.
   *
   * @returns A Promise that resolves to the decrypted column encryption key (plaintext CEK).
   *
   * @throws Error if decryption fails (e.g., key not found, invalid signature, etc.)
   */
  decryptColumnEncryptionKey(
    masterKeyPath: string,
    encryptionAlgorithm: string,
    encryptedColumnEncryptionKey: Buffer
  ): Promise<Buffer>;

  /**
   * Encrypts a column encryption key using the specified master key.
   *
   * This method is optional and used for key management scenarios such as:
   * - Creating new encrypted columns
   * - Rotating column master keys
   *
   * If not implemented, attempting to encrypt parameters for new encrypted columns
   * will fail. For read-only scenarios, this method can throw a "not implemented" error.
   *
   * @param masterKeyPath - The path/identifier of the column master key in the key store.
   *
   * @param encryptionAlgorithm - The algorithm to use for encrypting the CEK.
   *   Currently, SQL Server supports 'RSA_OAEP' for asymmetric key encryption.
   *
   * @param columnEncryptionKey - The plaintext column encryption key to encrypt.
   *
   * @returns A Promise that resolves to the encrypted column encryption key.
   *
   * @throws Error if encryption fails or is not supported.
   */
  encryptColumnEncryptionKey?(
    masterKeyPath: string,
    encryptionAlgorithm: string,
    columnEncryptionKey: Buffer
  ): Promise<Buffer>;
}

/**
 * Map of key store provider names to their implementations.
 * Used in connection options to register custom key store providers.
 */
export interface KeyStoreProviderMap {
  [providerName: string]: KeyStoreProvider;
}
