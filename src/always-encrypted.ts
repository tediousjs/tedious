import { BaseMetadata } from './metadata-parser';

export type EncryptionKeyInfo = {
  databaseId: number;
  keyId: number;
  keyVersion: number;
  mdVersion: Buffer;
  encryptedKey: Buffer;
  keyPath: string;
  keyStoreName: string;
  algorithmName: string;
};

export enum EncryptionType {
  PlainText = 0,
  Deterministic = 1,
  Randomized = 2,
}

export type CryptoMetadata = {
  encryptionKeys?: EncryptionKeyInfo[];
  cipherAlgorithmId: number;
  cipherAlgorithmName?: string;
  normalizationRuleVersion: Buffer;
  ordinal: number;
  encryptionType: EncryptionType;
  cipherAlgorithm?: EncryptionAlgorithm;
  baseTypeInfo?: BaseMetadata;
};

export interface EncryptionAlgorithm {
  encryptData: (plainText: Buffer) => Buffer;
  decryptData: (cipherText: Buffer) => Buffer;
}
