// This code is based on the `mssql-jdbc` library published under the conditions of MIT license.
// Copyright (c) 2019 Microsoft Corporation

import { type CryptoMetadata, type EncryptionKeyInfo, type EncryptionOptions } from './types';
import SymmetricKey from './symmetric-key';
import { getKey } from './symmetric-key-cache';
import { AeadAes256CbcHmac256Algorithm, algorithmName } from './aead-aes-256-cbc-hmac-algorithm';
import { AeadAes256CbcHmac256EncryptionKey } from './aead-aes-256-cbc-hmac-encryption-key';

export const validateAndGetEncryptionAlgorithmName = (cipherAlgorithmId: number, cipherAlgorithmName?: string): string => {
  if (cipherAlgorithmId !== 2) {
    throw new Error('Custom cipher algorithm not supported.');
  }

  return algorithmName;
};

export const encryptWithKey = async (plaintext: Buffer, md: CryptoMetadata, options: EncryptionOptions): Promise<Buffer> => {
  if (!md.cipherAlgorithm) {
    await decryptSymmetricKey(md, options);
  }

  if (!md.cipherAlgorithm) {
    throw new Error('Cipher Algorithm should not be null in EncryptWithKey');
  }

  const cipherText: Buffer = md.cipherAlgorithm.encryptData(plaintext);

  if (!cipherText) {
    throw new Error('Internal error. Ciphertext value cannot be null.');
  }

  return cipherText;
};

export const decryptWithKey = (cipherText: Buffer, md: CryptoMetadata, options: EncryptionOptions): Buffer => {
  // if (!md.cipherAlgorithm) {
  //   await decryptSymmetricKey(md, options);
  // }

  if (!md.cipherAlgorithm) {
    throw new Error('Cipher Algorithm should not be null in DecryptWithKey');
  }

  const plainText: Buffer = md.cipherAlgorithm.decryptData(cipherText);

  if (!plainText) {
    throw new Error('Internal error. Plaintext value cannot be null.');
  }

  return plainText;
};

export const decryptSymmetricKey = async (md: CryptoMetadata, options: EncryptionOptions): Promise<void> => {
  if (!md) {
    throw new Error('md should not be null in DecryptSymmetricKey.');
  }

  if (!md.cekEntry) {
    throw new Error('md.EncryptionInfo should not be null in DecryptSymmetricKey.');
  }

  if (!md.cekEntry.columnEncryptionKeyValues) {
    throw new Error('md.EncryptionInfo.ColumnEncryptionKeyValues should not be null in DecryptSymmetricKey.');
  }

  let symKey: SymmetricKey | undefined;
  let encryptionKeyInfoChosen: EncryptionKeyInfo | undefined;
  const CEKValues: EncryptionKeyInfo[] = md.cekEntry.columnEncryptionKeyValues;
  let lastError: Error | undefined;

  for (const CEKValue of CEKValues) {
    try {
      symKey = await getKey(CEKValue, options);
      if (symKey) {
        encryptionKeyInfoChosen = CEKValue;
        break;
      }
    } catch (error: any) {
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

  const algorithmName = validateAndGetEncryptionAlgorithmName(md.cipherAlgorithmId, md.cipherAlgorithmName);
  const cipherAlgorithm = new AeadAes256CbcHmac256Algorithm(new AeadAes256CbcHmac256EncryptionKey(symKey.rootKey, algorithmName), md.encryptionType);

  md.cipherAlgorithm = cipherAlgorithm;
  md.encryptionKeyInfo = encryptionKeyInfoChosen as EncryptionKeyInfo;
};
