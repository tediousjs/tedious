// This code is based on the `mssql-jdbc` library published under the conditions of MIT license.
// Copyright (c) 2019 Microsoft Corporation

import { CEKEntry } from './cek-entry';
import { type BaseMetadata } from '../metadata-parser';

export interface EncryptionKeyInfo {
  encryptedKey: Buffer;
  dbId: number;
  keyId: number;
  keyVersion: number;
  mdVersion: Buffer;
  keyPath: string;
  keyStoreName: string;
  algorithmName: string;
}

export const SQLServerEncryptionType = {
  Deterministic: 1,
  Randomized: 2,
  PlainText: 0,
} as const;

// The value and the type intentionally share a name (mirroring the original
// `enum`), so the redeclaration check does not apply here.
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type SQLServerEncryptionType = typeof SQLServerEncryptionType[keyof typeof SQLServerEncryptionType];

export interface EncryptionAlgorithm {
  encryptData: (plainText: Buffer) => Buffer;
  decryptData: (cipherText: Buffer) => Buffer;
}

export interface CryptoMetadata {
  cekEntry?: CEKEntry;
  cipherAlgorithmId: number;
  cipherAlgorithmName?: string;
  normalizationRuleVersion: Buffer;
  encryptionKeyInfo?: EncryptionKeyInfo;
  ordinal: number;
  encryptionType: SQLServerEncryptionType;
  cipherAlgorithm?: EncryptionAlgorithm;
  baseTypeInfo?: BaseMetadata;
}

export interface HashMap<T> {
  [hash: string]: T;
}


// Fields in the first resultset of "sp_describe_parameter_encryption"
// We expect the server to return the fields in the resultset in the same order as mentioned below.
// If the server changes the below order, then transparent parameter encryption will break.
export const DescribeParameterEncryptionResultSet1 = {
  KeyOrdinal: 0,
  DbId: 1,
  KeyId: 2,
  KeyVersion: 3,
  KeyMdVersion: 4,
  EncryptedKey: 5,
  ProviderName: 6,
  KeyPath: 7,
  KeyEncryptionAlgorithm: 8,
} as const;


// Fields in the second resultset of "sp_describe_parameter_encryption"
// We expect the server to return the fields in the resultset in the same order as mentioned below.
// If the server changes the below order, then transparent parameter encryption will break.
export const DescribeParameterEncryptionResultSet2 = {
  ParameterOrdinal: 0,
  ParameterName: 1,
  ColumnEncryptionAlgorithm: 2,
  ColumnEncrytionType: 3,
  ColumnEncryptionKeyOrdinal: 4,
  NormalizationRuleVersion: 5,
} as const;

export const SQLServerStatementColumnEncryptionSetting = {
  /**
   * if "Column Encryption Setting=Enabled" in the connection string, use Enabled. Otherwise, maps to Disabled.
   */
  UseConnectionSetting: 0,
  /**
   * Enables TCE for the command. Overrides the connection level setting for this command.
   */
  Enabled: 1,
  /**
   * Parameters will not be encrypted, only the ResultSet will be decrypted. This is an optimization for queries that
   * do not pass any encrypted input parameters. Overrides the connection level setting for this command.
   */
  ResultSetOnly: 2,
  /**
   * Disables TCE for the command.Overrides the connection level setting for this command.
   */
  Disabled: 3,
} as const;

// The value and the type intentionally share a name (mirroring the original
// `enum`), so the redeclaration check does not apply here.
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type SQLServerStatementColumnEncryptionSetting = typeof SQLServerStatementColumnEncryptionSetting[keyof typeof SQLServerStatementColumnEncryptionSetting];
