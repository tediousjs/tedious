import { EncryptionKeyInfo } from "./types";
import SQLServerSymmetricKey from "./SQLServerSymmetricKey";
import { InternalConnectionOptions as ConnectionOptions } from "../connection";
import LRU from "lru-cache";

const cache = new LRU<string, SQLServerSymmetricKey>(0);

export default class SQLServerSymmetricKeyCache {

  static async getKey(keyInfo: EncryptionKeyInfo, options: ConnectionOptions): Promise<SQLServerSymmetricKey> {
    if (!options.trustedServerNameAE) {
      throw new Error("Server name should not be null in getKey");
    }

    const serverName: string = options.trustedServerNameAE;

    const keyLookupValue: string = `${serverName}:${Buffer.from(keyInfo.encryptedKey).toString("base64")}:${keyInfo.keyStoreName}`;
    
    if (cache.has(keyLookupValue)) {
      return <SQLServerSymmetricKey>cache.get(keyLookupValue);
    } else {
      let provider = options.globalCustomColumnEncryptionKeyStoreProviders && options.globalCustomColumnEncryptionKeyStoreProviders[keyInfo.keyStoreName];
      if (!provider) {
        provider = options.globalCustomColumnEncryptionKeyStoreProviders && options.globalCustomColumnEncryptionKeyStoreProviders[keyInfo.keyStoreName];
      }
      if (!provider) {
        throw new Error(`Failed to decrypt a column encryption key. Invalid key store provider name: ${keyInfo.keyStoreName}. A key store provider name must denote either a system key store provider or a registered custom key store provider. Valid (currently registered) custom key store provider names are: ${options.globalCustomColumnEncryptionKeyStoreProviders}. Please verify key store provider information in column master key definitions in the database, and verify all custom key store providers used in your application are registered properly.`);
      }

      const plaintextKey: Buffer = await provider.decryptColumnEncryptionKey(keyInfo.keyPath, keyInfo.algorithmName, keyInfo.encryptedKey);

      const encryptionKey = new SQLServerSymmetricKey(plaintextKey);

      if (options.columnEncryptionKeyCacheTTL > 0) {
        cache.set(keyLookupValue, encryptionKey, options.columnEncryptionKeyCacheTTL);
      }

      return encryptionKey;
    }
  }
}