import { createHmac } from 'crypto';
import SQLServerSymmetricKey from './SQLServerSymmetricKey';

export const keySize = 256;
const keySizeInBytes = keySize / 8;

export const deriveKey = (rootKey: Buffer, salt: string): Buffer => {
  const hmac = createHmac('sha256', rootKey);
  hmac.update(Buffer.from(salt, 'utf16le'));
  const derivedKeyBuff = hmac.digest().slice(0, keySizeInBytes);
  return derivedKeyBuff;
};

export const generateKeySalt = (
  keyType: 'encryption' | 'MAC' | 'IV',
  algorithmName: string,
  keySize: number,
): string =>
  `Microsoft SQL Server cell ${keyType} key ` +
  `with encryption algorithm:${algorithmName} and key length:${keySize}`;

export class SQLServerAeadAes256CbcHmac256EncryptionKey extends SQLServerSymmetricKey {
  private readonly algorithmName: string;
  private encryptionKeySaltFormat: string;
  private macKeySaltFormat: string;
  private ivKeySaltFormat: string;
  private encryptionKey: SQLServerSymmetricKey;
  private macKey: SQLServerSymmetricKey;
  private ivKey: SQLServerSymmetricKey;

  constructor(rootKey: Buffer, algorithmName: string) {
    super(rootKey);
    this.algorithmName = algorithmName;
    this.encryptionKeySaltFormat = generateKeySalt('encryption', this.algorithmName, keySize);
    this.macKeySaltFormat = generateKeySalt('MAC', this.algorithmName, keySize);
    this.ivKeySaltFormat = generateKeySalt('IV', this.algorithmName, keySize);

    if (rootKey.length !== keySizeInBytes) {
      throw new Error(`The column encryption key has been successfully decrypted but its length: ${rootKey.length} does not match the length: ${keySizeInBytes} for algorithm "${this.algorithmName}". Verify the encrypted value of the column encryption key in the database.`);
    }

    try {
      const encKeyBuff = deriveKey(rootKey, this.encryptionKeySaltFormat);

      this.encryptionKey = new SQLServerSymmetricKey(encKeyBuff);

      const macKeyBuff = deriveKey(rootKey, this.macKeySaltFormat);

      this.macKey = new SQLServerSymmetricKey(macKeyBuff);

      const ivKeyBuff = deriveKey(rootKey, this.ivKeySaltFormat);

      this.ivKey = new SQLServerSymmetricKey(ivKeyBuff);
    } catch (error) {
      throw new Error(`Key extraction failed : ${error.message}.`);
    }
  }

  getEncryptionKey(): Buffer {
    return this.encryptionKey.rootKey;
  }

  getMacKey(): Buffer {
    return this.macKey.rootKey;
  }

  getIvKey(): Buffer {
    return this.ivKey.rootKey;
  }
}
