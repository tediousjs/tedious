// This code is based on the `mssql-jdbc` library published under the conditions of MIT license.
// Copyright (c) 2019 Microsoft Corporation

import { ClientSecretCredential } from '@azure/identity';
import { CryptographyClient, type KeyWrapAlgorithm, KeyClient, type KeyVaultKey } from '@azure/keyvault-keys';
import { createHash } from 'crypto';
import { parse } from 'url';

import { type KeyStoreProvider } from './keystore-provider';

interface ParsedKeyPath {
  vaultUrl: string;
  name: string;
  version?: string | undefined;
}

/**
 * Key store provider implementation for Azure Key Vault.
 *
 * This provider enables Always Encrypted to use column master keys stored in Azure Key Vault.
 * It uses Azure AD service principal authentication with client credentials.
 *
 * @example
 * ```typescript
 * const keyVaultProvider = new ColumnEncryptionAzureKeyVaultProvider(
 *   'client-id',
 *   'client-secret',
 *   'tenant-id'
 * );
 *
 * const connection = new Connection({
 *   // ... other options
 *   options: {
 *     encryptionKeyStoreProviders: [keyVaultProvider]
 *   }
 * });
 * ```
 */
export class ColumnEncryptionAzureKeyVaultProvider implements KeyStoreProvider {
  declare public readonly name: string;
  declare private url: undefined | string;
  declare private readonly rsaEncryptionAlgorithmWithOAEPForAKV: string;
  declare private readonly firstVersion: Buffer;
  declare private credentials: ClientSecretCredential;
  declare private readonly azureKeyVaultDomainName: string;
  declare private keyClient: undefined | KeyClient;

  constructor(clientId: string, clientKey: string, tenantId: string) {
    this.name = 'AZURE_KEY_VAULT';
    this.azureKeyVaultDomainName = 'vault.azure.net';
    this.rsaEncryptionAlgorithmWithOAEPForAKV = 'RSA-OAEP';
    this.firstVersion = Buffer.from([0x01]);
    this.credentials = new ClientSecretCredential(tenantId, clientId, clientKey);
  }

  async decryptColumnEncryptionKey(masterKeyPath: string, encryptionAlgorithm: string, encryptedColumnEncryptionKey: Buffer): Promise<Buffer> {
    if (!encryptedColumnEncryptionKey) {
      throw new Error('Internal error. Encrypted column encryption key cannot be null.');
    }

    if (encryptedColumnEncryptionKey.length === 0) {
      throw new Error('Internal error. Empty encrypted column encryption key specified.');
    }

    encryptionAlgorithm = this.validateEncryptionAlgorithm(encryptionAlgorithm);

    const masterKey = await this.getMasterKey(masterKeyPath);

    const keySizeInBytes = this.getAKVKeySize(masterKey);

    const cryptoClient = this.createCryptoClient(masterKey);

    if (encryptedColumnEncryptionKey[0] !== this.firstVersion[0]) {
      throw new Error(`Specified encrypted column encryption key contains an invalid encryption algorithm version ${Buffer.from([encryptedColumnEncryptionKey[0]]).toString('hex')}. Expected version is ${Buffer.from([this.firstVersion[0]]).toString('hex')}.`);
    }

    let currentIndex = this.firstVersion.length;
    const keyPathLength: number = encryptedColumnEncryptionKey.readInt16LE(currentIndex);

    currentIndex += 2;

    const cipherTextLength: number = encryptedColumnEncryptionKey.readInt16LE(currentIndex);

    currentIndex += 2;

    currentIndex += keyPathLength;

    if (cipherTextLength !== keySizeInBytes) {
      throw new Error(`The specified encrypted column encryption key's ciphertext length: ${cipherTextLength} does not match the ciphertext length: ${keySizeInBytes} when using column master key (Azure Key Vault key) in ${masterKeyPath}. The encrypted column encryption key may be corrupt, or the specified Azure Key Vault key path may be incorrect.`);
    }

    const signatureLength: number = encryptedColumnEncryptionKey.length - currentIndex - cipherTextLength;

    if (signatureLength !== keySizeInBytes) {
      throw new Error(`The specified encrypted column encryption key's signature length: ${signatureLength} does not match the signature length: ${keySizeInBytes} when using column master key (Azure Key Vault key) in ${masterKeyPath}. The encrypted column encryption key may be corrupt, or the specified Azure Key Vault key path may be incorrect.`);
    }

    const cipherText = Buffer.alloc(cipherTextLength);
    encryptedColumnEncryptionKey.copy(cipherText, 0, currentIndex, currentIndex + cipherTextLength);
    currentIndex += cipherTextLength;

    const signature = Buffer.alloc(signatureLength);
    encryptedColumnEncryptionKey.copy(signature, 0, currentIndex, currentIndex + signatureLength);

    const hash = Buffer.alloc(encryptedColumnEncryptionKey.length - signature.length);
    encryptedColumnEncryptionKey.copy(hash, 0, 0, encryptedColumnEncryptionKey.length - signature.length);

    const messageDigest = createHash('sha256');
    messageDigest.update(hash);

    const dataToVerify: Buffer = messageDigest.digest();

    if (!dataToVerify) {
      throw new Error('Hash should not be null while decrypting encrypted column encryption key.');
    }

    const verifyKey = await cryptoClient.verify('RS256', dataToVerify, signature);
    if (!verifyKey.result) {
      throw new Error(`The specified encrypted column encryption key signature does not match the signature computed with the column master key (Asymmetric key in Azure Key Vault) in ${masterKeyPath}. The encrypted column encryption key may be corrupt, or the specified path may be incorrect.`);
    }

    const decryptedCEK: Buffer = await this.azureKeyVaultUnWrap(cryptoClient, encryptionAlgorithm, cipherText);

    return decryptedCEK;
  }

  async encryptColumnEncryptionKey(masterKeyPath: string, encryptionAlgorithm: string, columnEncryptionKey: Buffer): Promise<Buffer> {
    if (!columnEncryptionKey) {
      throw new Error('Column encryption key cannot be null.');
    }

    if (columnEncryptionKey.length === 0) {
      throw new Error('Empty column encryption key specified.');
    }

    encryptionAlgorithm = this.validateEncryptionAlgorithm(encryptionAlgorithm);

    const masterKey = await this.getMasterKey(masterKeyPath);

    const keySizeInBytes = this.getAKVKeySize(masterKey);

    const cryptoClient = this.createCryptoClient(masterKey);

    const version = Buffer.from([this.firstVersion[0]]);

    const masterKeyPathBytes: Buffer = Buffer.from(masterKeyPath.toLowerCase(), 'utf8');

    const keyPathLength: Buffer = Buffer.alloc(2);

    keyPathLength[0] = masterKeyPathBytes.length & 0xff;
    keyPathLength[1] = masterKeyPathBytes.length >> 8 & 0xff;

    const cipherText: Buffer = await this.azureKeyVaultWrap(cryptoClient, encryptionAlgorithm, columnEncryptionKey);

    const cipherTextLength: Buffer = Buffer.alloc(2);

    cipherTextLength[0] = cipherText.length & 0xff;
    cipherTextLength[1] = cipherText.length >> 8 & 0xff;

    if (cipherText.length !== keySizeInBytes) {
      throw new Error('CipherText length does not match the RSA key size.');
    }

    const dataToHash: Buffer = Buffer.alloc(version.length + keyPathLength.length + cipherTextLength.length + masterKeyPathBytes.length + cipherText.length);
    let destinationPosition: number = version.length;
    version.copy(dataToHash, 0, 0, version.length);

    keyPathLength.copy(dataToHash, destinationPosition, 0, keyPathLength.length);
    destinationPosition += keyPathLength.length;

    cipherTextLength.copy(dataToHash, destinationPosition, 0, cipherTextLength.length);
    destinationPosition += cipherTextLength.length;

    masterKeyPathBytes.copy(dataToHash, destinationPosition, 0, masterKeyPathBytes.length);
    destinationPosition += masterKeyPathBytes.length;

    cipherText.copy(dataToHash, destinationPosition, 0, cipherText.length);

    const messageDigest = createHash('sha256');

    messageDigest.update(dataToHash);

    const dataToSign: Buffer = messageDigest.digest();

    const signedHash: Buffer = await this.azureKeyVaultSignedHashedData(cryptoClient, dataToSign);
    if (signedHash.length !== keySizeInBytes) {
      throw new Error('Signed hash length does not match the RSA key size.');
    }

    const verifyKey = await cryptoClient.verify('RS256', dataToSign, signedHash);

    if (!verifyKey.result) {
      throw new Error('Invalid signature of the encrypted column encryption key computed.');
    }

    const encryptedColumnEncryptionKeyLength: number = version.length + cipherTextLength.length + keyPathLength.length + cipherText.length + masterKeyPathBytes.length + signedHash.length;
    const encryptedColumnEncryptionKey: Buffer = Buffer.alloc(encryptedColumnEncryptionKeyLength);

    let currentIndex = 0;
    version.copy(encryptedColumnEncryptionKey, currentIndex, 0, version.length);
    currentIndex += version.length;

    keyPathLength.copy(encryptedColumnEncryptionKey, currentIndex, 0, keyPathLength.length);
    currentIndex += keyPathLength.length;

    cipherTextLength.copy(encryptedColumnEncryptionKey, currentIndex, 0, cipherTextLength.length);
    currentIndex += cipherTextLength.length;

    masterKeyPathBytes.copy(encryptedColumnEncryptionKey, currentIndex, 0, masterKeyPathBytes.length);
    currentIndex += masterKeyPathBytes.length;

    cipherText.copy(encryptedColumnEncryptionKey, currentIndex, 0, cipherText.length);
    currentIndex += cipherText.length;

    signedHash.copy(encryptedColumnEncryptionKey, currentIndex, 0, signedHash.length);

    return encryptedColumnEncryptionKey;
  }

  private async getMasterKey(masterKeyPath: string): Promise<KeyVaultKey> {
    if (!masterKeyPath) {
      throw new Error('Master key path cannot be null or undefined');
    }
    const keyParts = this.parsePath(masterKeyPath);

    this.createKeyClient(keyParts.vaultUrl);

    return await (this.keyClient as KeyClient).getKey(keyParts.name, keyParts.version ? { version: keyParts.version } : {});
  }

  private createKeyClient(keyVaultUrl: string): void {
    if (!keyVaultUrl) {
      throw new Error('Cannot create key client with null or undefined keyVaultUrl');
    }
    if (!this.keyClient) {
      this.url = keyVaultUrl;
      this.keyClient = new KeyClient(keyVaultUrl, this.credentials);
    }
  }

  private createCryptoClient(masterKey: KeyVaultKey): CryptographyClient {
    if (!masterKey) {
      throw new Error('Cannot create CryptographyClient with null or undefined masterKey');
    }
    return new CryptographyClient(masterKey, this.credentials);
  }

  private parsePath(masterKeyPath: string): ParsedKeyPath {
    if (!masterKeyPath || masterKeyPath.trim() === '') {
      throw new Error('Azure Key Vault key path cannot be null.');
    }

    let baseUri;
    try {
      baseUri = parse(masterKeyPath, true, true);
    } catch {
      throw new Error(`Invalid keys identifier: ${masterKeyPath}. Not a valid URI`);
    }

    if (!baseUri.hostname || !baseUri.hostname.toLowerCase().endsWith(this.azureKeyVaultDomainName)) {
      throw new Error(`Invalid Azure Key Vault key path specified: ${masterKeyPath}.`);
    }

    // Path is of the form '/collection/name[/version]'
    const segments = (baseUri.pathname || '').split('/');
    if (segments.length !== 3 && segments.length !== 4) {
      throw new Error(
        `Invalid keys identifier: ${masterKeyPath}. Bad number of segments: ${segments.length}`
      );
    }

    if ('keys' !== segments[1]) {
      throw new Error(
        `Invalid keys identifier: ${masterKeyPath}. segment [1] should be "keys", found "${segments[1]}"`
      );
    }

    const vaultUrl = `${baseUri.protocol}//${baseUri.host}`;
    const name = segments[2];
    const version = segments.length === 4 ? segments[3] : undefined;
    return {
      vaultUrl,
      name,
      version
    };
  }

  private async azureKeyVaultSignedHashedData(cryptoClient: CryptographyClient, dataToSign: Buffer): Promise<Buffer> {
    if (!cryptoClient) {
      throw new Error('Azure KVS Crypto Client is not defined.');
    }

    const signedData = await cryptoClient.sign('RS256', dataToSign);

    return Buffer.from(signedData.result);
  }

  private async azureKeyVaultWrap(cryptoClient: CryptographyClient, encryptionAlgorithm: string, columnEncryptionKey: Buffer): Promise<Buffer> {
    if (!cryptoClient) {
      throw new Error('Azure KVS Crypto Client is not defined.');
    }

    if (!columnEncryptionKey) {
      throw new Error('Column encryption key cannot be null.');
    }

    const wrappedKey = await cryptoClient.wrapKey(encryptionAlgorithm as KeyWrapAlgorithm, columnEncryptionKey);

    return Buffer.from(wrappedKey.result);
  }

  private async azureKeyVaultUnWrap(cryptoClient: CryptographyClient, encryptionAlgorithm: string, encryptedColumnEncryptionKey: Buffer): Promise<Buffer> {
    if (!cryptoClient) {
      throw new Error('Azure KVS Crypto Client is not defined.');
    }

    if (!encryptionAlgorithm) {
      throw new Error('Encryption Algorithm cannot be null or undefined');
    }

    if (!encryptedColumnEncryptionKey) {
      throw new Error('Encrypted column encryption key cannot be null.');
    }

    if (encryptedColumnEncryptionKey.length === 0) {
      throw new Error('Encrypted Column Encryption Key length should not be zero.');
    }

    const unwrappedKey = await cryptoClient.unwrapKey(encryptionAlgorithm as KeyWrapAlgorithm, encryptedColumnEncryptionKey);

    return Buffer.from(unwrappedKey.result);
  }

  private getAKVKeySize(retrievedKey: KeyVaultKey): number {
    if (!retrievedKey) {
      throw new Error('Retrieved key cannot be null or undefined');
    }
    const key = retrievedKey.key;

    if (!key) {
      throw new Error(`Key does not exist ${retrievedKey.name}`);
    }

    const kty: string | undefined = key && key.kty && key.kty.toString().toUpperCase();

    if (!kty || 'RSA'.localeCompare(kty, 'en') !== 0) {
      throw new Error(`Cannot use a non-RSA key: ${kty}.`);
    }

    const keyLength = key && key.n && key.n.length;

    return keyLength || 0;
  }

  private validateEncryptionAlgorithm(encryptionAlgorithm: string): string {
    if (!encryptionAlgorithm) {
      throw new Error('Key encryption algorithm cannot be null.');
    }

    if ('RSA_OAEP'.localeCompare(encryptionAlgorithm.toUpperCase(), 'en') === 0) {
      encryptionAlgorithm = 'RSA-OAEP';
    }

    if (this.rsaEncryptionAlgorithmWithOAEPForAKV.localeCompare(encryptionAlgorithm.trim().toUpperCase(), 'en') !== 0) {
      throw new Error(`Invalid key encryption algorithm specified: ${encryptionAlgorithm}. Expected value: ${this.rsaEncryptionAlgorithmWithOAEPForAKV}.`);
    }

    return encryptionAlgorithm;
  }
}
