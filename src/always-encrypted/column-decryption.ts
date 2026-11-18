import { type ColumnEncryptionCipher } from './cipher';
import { type ColumnEncryptionCiphers } from './key-cache';
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

// The keys whose ciphers a request made available, until it lets go of them.
const keysInUse = new WeakMap<object, ColumnEncryptionKeyInfo[]>();

// Keyed by the very object that the metadata parser created for a column:
// a copy of it (as an application might make of the metadata it is handed)
// is not known to be sent as PLP values.
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
 * Makes the ciphers of the column encryption keys of a result set available
 * to decrypt its values, until `releaseCiphers` is called for the same
 * request.
 */
export function useCiphers(request: object, ciphers: ColumnEncryptionCiphers) {
  releaseCiphers(request);

  for (const [key, cipher] of ciphers) {
    useCipher(key, cipher);
  }

  keysInUse.set(request, Array.from(ciphers.keys()));
}

/**
 * Lets go of the ciphers that a request made available: once the values of
 * its result set were decrypted, and when the request completes - however
 * it does, as an application may hold on to the descriptions of the keys
 * of a result set that was not read to its end.
 */
export function releaseCiphers(request: object) {
  const keys = keysInUse.get(request);
  if (keys !== undefined) {
    keysInUse.delete(request);

    for (const key of keys) {
      releaseCipher(key);
    }
  }
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
 *
 * This is noted for the `cryptoMetadata` object of the column, so the
 * metadata of a column has to be passed on to the value parser as it was
 * parsed, not as a copy.
 */
export function markAsPLP(cryptoMetadata: CryptoMetadata) {
  plpColumns.add(cryptoMetadata);
}

export function isPLP(cryptoMetadata: CryptoMetadata): boolean {
  return plpColumns.has(cryptoMetadata);
}
