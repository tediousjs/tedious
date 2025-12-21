// This code is based on the `mssql-jdbc` library published under the conditions of MIT license.
// Copyright (c) 2019 Microsoft Corporation

import { type EncryptionKeyInfo, type EncryptionOptions } from './types';
import SymmetricKey from './symmetric-key';
import LRU from 'lru-cache';

const cache = new LRU<string, SymmetricKey>(0);

export const getKey = async (keyInfo: EncryptionKeyInfo, options: EncryptionOptions): Promise<SymmetricKey> => {
  // Use the encrypted key value as the cache key - it's cryptographically unique per CEK
  // and already bound to the specific CMK that encrypted it
  const keyLookupValue = `${Buffer.from(keyInfo.encryptedKey).toString('base64')}:${keyInfo.keyStoreName}`;

  if (cache.has(keyLookupValue)) {
    return cache.get(keyLookupValue) as SymmetricKey;
  } else {
    const provider = options.encryptionKeyStoreProviders && options.encryptionKeyStoreProviders[keyInfo.keyStoreName];
    if (!provider) {
      throw new Error(`Failed to decrypt a column encryption key. Invalid key store provider name: ${keyInfo.keyStoreName}. A key store provider name must denote either a system key store provider or a registered custom key store provider. Valid (currently registered) custom key store provider names are: ${options.encryptionKeyStoreProviders}. Please verify key store provider information in column master key definitions in the database, and verify all custom key store providers used in your application are registered properly.`);
    }

    const plaintextKey: Buffer = await provider.decryptColumnEncryptionKey(keyInfo.keyPath, keyInfo.algorithmName, keyInfo.encryptedKey);

    const encryptionKey = new SymmetricKey(plaintextKey);

    if (options.columnEncryptionKeyCacheTTL > 0) {
      cache.set(keyLookupValue, encryptionKey, options.columnEncryptionKeyCacheTTL);
    }

    return encryptionKey;
  }
};
