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

export enum SQLServerEncryptionType {
  Deterministic = 1,
  Randomized = 2,
  PlainText = 0,
}

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
export enum DescribeParameterEncryptionResultSet1 {
  KeyOrdinal,
  DbId,
  KeyId,
  KeyVersion,
  KeyMdVersion,
  EncryptedKey,
  ProviderName,
  KeyPath,
  KeyEncryptionAlgorithm
}


// Fields in the second resultset of "sp_describe_parameter_encryption"
// We expect the server to return the fields in the resultset in the same order as mentioned below.
// If the server changes the below order, then transparent parameter encryption will break.
export enum DescribeParameterEncryptionResultSet2 {
  ParameterOrdinal,
  ParameterName,
  ColumnEncryptionAlgorithm,
  ColumnEncrytionType,
  ColumnEncryptionKeyOrdinal,
  NormalizationRuleVersion
}

export enum SQLServerStatementColumnEncryptionSetting {
  /**
   * if "Column Encryption Setting=Enabled" in the connection string, use Enabled. Otherwise, maps to Disabled.
   */
  UseConnectionSetting,
  /**
   * Enables TCE for the command. Overrides the connection level setting for this command.
   */
  Enabled,
  /**
   * Parameters will not be encrypted, only the ResultSet will be decrypted. This is an optimization for queries that
   * do not pass any encrypted input parameters. Overrides the connection level setting for this command.
   */
  ResultSetOnly,
  /**
   * Disables TCE for the command.Overrides the connection level setting for this command.
   */
  Disabled,
}

import { type KeyStoreProviderMap } from './keystore-provider';

/**
 * Options required for column encryption/decryption operations.
 * This interface is a subset of connection options needed by the encryption layer.
 */
export interface EncryptionOptions {
  /**
   * Map of registered key store providers.
   */
  encryptionKeyStoreProviders: KeyStoreProviderMap | undefined;

  /**
   * TTL for cached column encryption keys in milliseconds.
   */
  columnEncryptionKeyCacheTTL: number;
}
