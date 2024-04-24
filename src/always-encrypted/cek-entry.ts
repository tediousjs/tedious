// This code is based on the `mssql-jdbc` library published under the conditions of MIT license.
// Copyright (c) 2019 Microsoft Corporation

import { type EncryptionKeyInfo } from './types';

export class CEKEntry {
  declare columnEncryptionKeyValues: EncryptionKeyInfo[];
  declare ordinal: number;
  declare databaseId: number;
  declare cekId: number;
  declare cekVersion: number;
  declare cekMdVersion: Buffer;

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

  addEntry(encryptionKey: EncryptionKeyInfo): void {
    this.columnEncryptionKeyValues.push(encryptionKey);

    if (this.databaseId === 0) {
      this.databaseId = encryptionKey.dbId;
      this.cekId = encryptionKey.keyId;
      this.cekVersion = encryptionKey.keyVersion;
      this.cekMdVersion = encryptionKey.mdVersion;
    } else if ((this.databaseId !== encryptionKey.dbId) ||
     (this.cekId !== encryptionKey.keyId) ||
     (this.cekVersion !== encryptionKey.keyVersion) ||
     !this.cekMdVersion || !encryptionKey.mdVersion ||
     this.cekMdVersion.length !== encryptionKey.mdVersion.length) {
      throw new Error('Invalid databaseId, cekId, cekVersion or cekMdVersion.');
    }
  }
}
