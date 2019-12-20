import { CEKTableEntry } from "./CEKTableEntry";
import { BaseMetadata } from "../metadata-parser";

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

export interface SQLServerEncryptionAlgorithm {
  encryptData: (plainText: Buffer) => Buffer;
  decryptData: (cipherText: Buffer) => Buffer;
}

export interface CryptoMetadata {
  cekTableEntry?: CEKTableEntry;
  cipherAlgorithmId: number;
  cipherAlgorithmName?: string;
  normalizationRuleVersion: Buffer;
  encryptionKeyInfo?: EncryptionKeyInfo;
  ordinal: number;
  encryptionType: SQLServerEncryptionType;
  cipherAlgorithm?: SQLServerEncryptionAlgorithm;
  baseTypeInfo?: BaseMetadata;
}

export interface HashMap<T> {
  [hash: string]: T
}

