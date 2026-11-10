import { createCipheriv, createDecipheriv, createHmac, createSecretKey, randomFillSync, timingSafeEqual, type KeyObject } from 'crypto';

/**
 * The id SQL Server uses for the `AEAD_AES_256_CBC_HMAC_SHA256` algorithm,
 * the only cell encryption algorithm Always Encrypted defines.
 */
export const ALGORITHM_ID = 2;
export const ALGORITHM_NAME = 'AEAD_AES_256_CBC_HMAC_SHA256';

const KEY_LENGTH = 32;
const BLOCK_LENGTH = 16;

// An encrypted cell is laid out as:
//
//   version (1 byte) | MAC (32 bytes) | IV (16 bytes) | AES-256-CBC ciphertext
//
// with the MAC computed over `version | IV | ciphertext | version length`.
const VERSION = 0x01;
const VERSION_BYTES = Buffer.from([VERSION]);
const VERSION_LENGTH_BYTES = Buffer.from([VERSION_BYTES.length]);

const MAC_OFFSET = 1;
const IV_OFFSET = MAC_OFFSET + 32;
const CIPHERTEXT_OFFSET = IV_OFFSET + BLOCK_LENGTH;
const MIN_CELL_LENGTH = CIPHERTEXT_OFFSET + BLOCK_LENGTH;

function deriveKey(columnEncryptionKey: Buffer, purpose: 'encryption' | 'MAC' | 'IV'): KeyObject {
  const salt = `Microsoft SQL Server cell ${purpose} key with encryption algorithm:${ALGORITHM_NAME} and key length:${KEY_LENGTH * 8}`;
  return createSecretKey(createHmac('sha256', columnEncryptionKey).update(salt, 'utf16le').digest());
}

/**
 * Encrypts and decrypts cell values with a column encryption key, using the
 * `AEAD_AES_256_CBC_HMAC_SHA256` algorithm (encrypt-then-MAC).
 *
 * The keys derived from the column encryption key are kept as `KeyObject`s,
 * so one instance is meant to be reused for all values of a key.
 *
 * @see https://learn.microsoft.com/en-us/sql/relational-databases/security/encryption/always-encrypted-cryptography
 */
export class ColumnEncryptionCipher {
  declare private readonly encryptionKey: KeyObject;
  declare private readonly macKey: KeyObject;
  declare private readonly ivKey: KeyObject;

  constructor(columnEncryptionKey: Buffer) {
    if (columnEncryptionKey.length !== KEY_LENGTH) {
      throw new Error(`A column encryption key for ${ALGORITHM_NAME} must be ${KEY_LENGTH} bytes long, but the key is ${columnEncryptionKey.length} bytes long.`);
    }

    this.encryptionKey = deriveKey(columnEncryptionKey, 'encryption');
    this.macKey = deriveKey(columnEncryptionKey, 'MAC');
    this.ivKey = deriveKey(columnEncryptionKey, 'IV');
  }

  /**
   * Encrypts a (normalized) value.
   *
   * Deterministic encryption derives the IV from the plaintext, so equal
   * values encrypt to equal cells. Randomized encryption uses a random IV.
   */
  encrypt(plaintext: Buffer, deterministic: boolean): Buffer {
    // PKCS#7 always pads, up to the next block boundary.
    const ciphertextLength = plaintext.length - (plaintext.length % BLOCK_LENGTH) + BLOCK_LENGTH;
    const cell = Buffer.allocUnsafe(CIPHERTEXT_OFFSET + ciphertextLength);
    cell[0] = VERSION;

    const iv = cell.subarray(IV_OFFSET, CIPHERTEXT_OFFSET);
    if (deterministic) {
      createHmac('sha256', this.ivKey).update(plaintext).digest().copy(iv, 0, 0, BLOCK_LENGTH);
    } else {
      randomFillSync(iv);
    }

    const cipher = createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    const written = cipher.update(plaintext).copy(cell, CIPHERTEXT_OFFSET);
    cipher.final().copy(cell, CIPHERTEXT_OFFSET + written);

    this.computeMac(cell).copy(cell, MAC_OFFSET);

    return cell;
  }

  /**
   * Verifies and decrypts an encrypted cell, returning the (normalized)
   * value.
   */
  decrypt(cell: Buffer): Buffer {
    if (cell.length < MIN_CELL_LENGTH || (cell.length - CIPHERTEXT_OFFSET) % BLOCK_LENGTH !== 0) {
      throw new Error(`The encrypted value has an invalid length of ${cell.length} bytes.`);
    }

    if (cell[0] !== VERSION) {
      throw new Error(`The encrypted value has an unsupported algorithm version 0x${cell[0].toString(16).padStart(2, '0')}.`);
    }

    if (!timingSafeEqual(this.computeMac(cell), cell.subarray(MAC_OFFSET, IV_OFFSET))) {
      throw new Error('The encrypted value has an invalid authentication tag.');
    }

    // Removing the padding by hand lets the whole plaintext be decrypted
    // into a single buffer, without concatenating the cipher's final block.
    const decipher = createDecipheriv('aes-256-cbc', this.encryptionKey, cell.subarray(IV_OFFSET, CIPHERTEXT_OFFSET));
    decipher.setAutoPadding(false);
    const padded = decipher.update(cell.subarray(CIPHERTEXT_OFFSET));
    decipher.final();

    const paddingLength = padded[padded.length - 1];
    if (paddingLength < 1 || paddingLength > BLOCK_LENGTH) {
      throw new Error('The encrypted value has an invalid padding.');
    }

    return padded.subarray(0, padded.length - paddingLength);
  }

  private computeMac(cell: Buffer): Buffer {
    return createHmac('sha256', this.macKey)
      .update(VERSION_BYTES)
      .update(cell.subarray(IV_OFFSET))
      .update(VERSION_LENGTH_BYTES)
      .digest();
  }
}
