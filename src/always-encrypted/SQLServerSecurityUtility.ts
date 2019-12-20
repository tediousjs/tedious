import { CryptoMetadata, EncryptionKeyInfo } from './types';
import { InternalConnectionOptions as ConnectionOptions } from '../connection';
import SQLServerSymmetricKey from './SQLServerSymmetricKey';
import SQLServerSymmetricKeyCache from './SQLServerSymmetricKeyCache';
import { SQLServerAeadAes256CbcHmac256Algorithm, algorithmName } from './SQLServerAeadAes256CbcHmac256Algorithm';
import { SQLServerAeadAes256CbcHmac256EncryptionKey } from './SQLServerAeadAes256CbcHmac256EncryptionKey';

export class SQLServerSecurityUtility {
  static validateAndGetEncryptionAlgorithmName(cipherAlgorithmId: number, cipherAlgorithmName?: string): string {
    if (cipherAlgorithmId !== 2) {
      throw new Error('Custom cipher algorithm not supported.');
    }

    return algorithmName;
  }

  static async encryptWithKey(plaintext: Buffer, md: CryptoMetadata, options: ConnectionOptions): Promise<Buffer> {
    if (!options.trustedServerNameAE) {
      throw new Error('Server name should not be null in EncryptWithKey');
    }

    if (!md.cipherAlgorithm) {
      await SQLServerSecurityUtility.decryptSymmetricKey(md, options);
    }

    if (!md.cipherAlgorithm) {
      throw new Error('Cipher Algorithm should not be null in EncryptWithKey');
    }

    const cipherText: Buffer = md.cipherAlgorithm.encryptData(plaintext);

    if (!cipherText) {
      throw new Error('Internal error. Ciphertext value cannot be null.');
    }

    return cipherText;
  }

  static async decryptWithKey(cipherText: Buffer, md: CryptoMetadata, options: ConnectionOptions): Promise<Buffer> {
    if (!options.trustedServerNameAE) {
      throw new Error('Server name should not be null in DecryptWithKey');
    }

    if (!md.cipherAlgorithm) {
      await SQLServerSecurityUtility.decryptSymmetricKey(md, options);
    }

    if (!md.cipherAlgorithm) {
      throw new Error('Cipher Algorithm should not be null in DecryptWithKey');
    }

    const plainText: Buffer = md.cipherAlgorithm.decryptData(cipherText);

    if (!plainText) {
      throw new Error('Internal error. Plain text value cannot be null.');
    }

    return plainText;
  }

  static async decryptSymmetricKey(md: CryptoMetadata, options: ConnectionOptions): Promise<void> {
    if (!md) {
      throw new Error('md should not be null in DecryptSymmetricKey.');
    }

    if (!md.cekTableEntry) {
      throw new Error('md.EncryptionInfo should not be null in DecryptSymmetricKey.');
    }

    if (!md.cekTableEntry.columnEncryptionKeyValues) {
      throw new Error('md.EncryptionInfo.ColumnEncryptionKeyValues should not be null in DecryptSymmetricKey.');
    }

    let symKey: SQLServerSymmetricKey | undefined;
    let encryptionKeyInfoChosen: EncryptionKeyInfo | undefined;
    const CEKValues: EncryptionKeyInfo[] = md.cekTableEntry.columnEncryptionKeyValues;
    let lastError: Error | undefined;

    for (const CEKValue of CEKValues) {
      try {
        symKey = await SQLServerSymmetricKeyCache.getKey(CEKValue, options);
        if (symKey) {
          encryptionKeyInfoChosen = CEKValue;
          break;
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (!symKey) {
      if (lastError) {
        throw lastError;
      } else {
        throw new Error('Exception while decryption of encrypted column encryption key.');
      }
    }

    const algorithmName = SQLServerSecurityUtility.validateAndGetEncryptionAlgorithmName(md.cipherAlgorithmId, md.cipherAlgorithmName);
    const cipherAlgorithm = new SQLServerAeadAes256CbcHmac256Algorithm(new SQLServerAeadAes256CbcHmac256EncryptionKey(symKey.rootKey, algorithmName), md.encryptionType);

    if (!cipherAlgorithm) {
      throw new Error('Cipher algorithm cannot be null in DecryptSymmetricKey');
    }

    md.cipherAlgorithm = cipherAlgorithm;
    md.encryptionKeyInfo = <EncryptionKeyInfo>encryptionKeyInfoChosen;
  }
}
