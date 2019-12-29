import { EncryptionKeyInfo } from './types';

export class CEKTable {
  keyList: CEKTableEntry[];

  constructor(tableSize: number) {
    this.keyList = [];
    for (let i = 0; i < tableSize; i++) {
      this.keyList.push(new CEKTableEntry(i));
    }
  }

  getCEKTableEntry(index: number) {
    return this.keyList[index];
  }

  setCEKTableEntry(index: number, entry: CEKTableEntry) {
    this.keyList[index] = entry;
  }
}

export class CEKTableEntry {
  columnEncryptionKeyValues: EncryptionKeyInfo[];
  ordinal: number;
  databaseId: number;
  cekId: number;
  cekVersion: number;
  cekMdVersion: Buffer;

  constructor(ordinalVal: number) {
    this.ordinal = ordinalVal;
    this.databaseId = 0;
    this.cekId = 0;
    this.cekVersion = 0;
    this.cekMdVersion = Buffer.alloc(0);
    this.columnEncryptionKeyValues = [];
  }

  add(encryptedKey: Buffer, dbId: number, keyId: number, keyVersion: number, mdVersion: Buffer, keyPath: string, keyStoreName: string, algorithmName: string): void {
    const encryptionKey: EncryptionKeyInfo = {
      encryptedKey,
      dbId,
      keyId,
      keyVersion,
      mdVersion,
      keyPath,
      keyStoreName,
      algorithmName,
    };

    this.columnEncryptionKeyValues.push(encryptionKey);

    if (this.databaseId === 0) {
      this.databaseId = dbId;
      this.cekId = keyId;
      this.cekVersion = keyVersion;
      this.cekMdVersion = mdVersion;
    } else if ((this.databaseId !== dbId) || (this.cekId !== keyId) || (this.cekVersion !== keyVersion) || !this.cekMdVersion || !mdVersion || this.cekMdVersion.length !== mdVersion.length) {
      throw new Error('Invalid databaseId, cekId, cekVersion or cekMdVersion.');
    }
  }
}
