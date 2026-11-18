import { type ColumnEncryptionCipher } from './cipher';
import { type ColumnEncryptionKeyInfo, type CryptoMetadata } from './types';

// What it takes to decrypt the values of a result set, beyond the
// description of its columns and keys (`CryptoMetadata` and
// `ColumnEncryptionKeyInfo`).
//
// It is kept apart from those descriptions, as they are handed out to
// applications - where they are passed around and logged - and a cipher
// holds what is derived from a column encryption key.

/**
 * A column encryption key, while the values of a result set are decrypted
 * with it.
 */
export interface ColumnEncryptionKeyState {
  /**
   * The cipher for the values encrypted with the key.
   */
  cipher: ColumnEncryptionCipher | undefined;

  /**
   * Set if a value could not be decrypted with the key. The cipher is
   * removed then, and values are left encrypted from there on.
   */
  error: Error | undefined;
}

const keyStates = new WeakMap<ColumnEncryptionKeyInfo, ColumnEncryptionKeyState>();
const plpColumns = new WeakSet<CryptoMetadata>();

/**
 * Makes the cipher of a column encryption key available to decrypt the
 * values of the result set that the key is part of.
 */
export function useCipher(key: ColumnEncryptionKeyInfo, cipher: ColumnEncryptionCipher) {
  keyStates.set(key, { cipher, error: undefined });
}

/**
 * Lets go of the cipher of a column encryption key, once the values of its
 * result set were decrypted. How long a decrypted key is kept from there
 * on is up to the key cache alone, whoever holds on to the description of
 * the key.
 */
export function releaseCipher(key: ColumnEncryptionKeyInfo) {
  keyStates.delete(key);
}

/**
 * The state of a column encryption key of a result set, if its cipher was
 * made available.
 */
export function keyStateOf(key: ColumnEncryptionKeyInfo): ColumnEncryptionKeyState | undefined {
  return keyStates.get(key);
}

/**
 * Notes that the encrypted values of a column are sent as PLP values
 * (`varbinary(max)`).
 */
export function markAsPLP(cryptoMetadata: CryptoMetadata) {
  plpColumns.add(cryptoMetadata);
}

export function isPLP(cryptoMetadata: CryptoMetadata): boolean {
  return plpColumns.has(cryptoMetadata);
}
