import { createCipheriv, createDecipheriv, createHmac, createSecretKey, hash, randomFillSync, timingSafeEqual, type Decipheriv, type KeyObject } from 'crypto';

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

function deriveKey(columnEncryptionKey: Buffer, purpose: 'encryption' | 'MAC' | 'IV'): Buffer {
  const salt = `Microsoft SQL Server cell ${purpose} key with encryption algorithm:${ALGORITHM_NAME} and key length:${KEY_LENGTH * 8}`;
  return createHmac('sha256', columnEncryptionKey).update(salt, 'utf16le').digest();
}

const HASH_LENGTH = 32;
const HASH_BLOCK_LENGTH = 64;

// Up to this length, the HMAC of a message is computed from one-shot hashes
// (see `HmacSha256`) instead of with an `Hmac` of its own.
const MAX_ONE_SHOT_LENGTH = 4096;

const NO_BYTES = Buffer.alloc(0);

/**
 * Computes HMACs (with SHA-256) of messages with the same key.
 *
 * An `Hmac` can only be used for a single message, and creating one takes
 * three times as long as hashing a short message does. Most encrypted values
 * are short, so their HMAC is computed the way HMAC is defined instead, from
 * two hashes that need no setting up:
 *
 *   HMAC(key, message) = H((key ^ opad) | H((key ^ ipad) | message))
 *
 * The padded key and what follows it are laid out in buffers that are reused
 * for each message.
 */
class HmacSha256 {
  declare private readonly key: KeyObject;

  // `key ^ ipad`, followed by the message
  declare private readonly inner: Buffer;

  // `key ^ opad`, followed by the hash of `inner`
  declare private readonly outer: Buffer;

  declare private readonly result: Buffer;

  constructor(key: Buffer) {
    this.key = createSecretKey(key);

    this.inner = Buffer.alloc(HASH_BLOCK_LENGTH + MAX_ONE_SHOT_LENGTH, 0x36);
    this.outer = Buffer.alloc(HASH_BLOCK_LENGTH + HASH_LENGTH, 0x5C);
    for (let i = 0; i < key.length; i++) {
      this.inner[i] ^= key[i];
      this.outer[i] ^= key[i];
    }

    this.result = Buffer.alloc(HASH_LENGTH);
  }

  /**
   * Computes the HMAC of `prefix`, `message` from `start` on, and `suffix`.
   *
   * The returned buffer is reused by the next call.
   */
  digest(message: Buffer, start = 0, prefix = NO_BYTES, suffix = NO_BYTES): Buffer {
    const length = prefix.length + (message.length - start) + suffix.length;

    if (length > MAX_ONE_SHOT_LENGTH) {
      return createHmac('sha256', this.key).update(prefix).update(message.subarray(start)).update(suffix).digest();
    }

    const { inner, outer, result } = this;

    let offset = HASH_BLOCK_LENGTH;
    offset += prefix.copy(inner, offset);
    offset += message.copy(inner, offset, start);
    offset += suffix.copy(inner, offset);

    // Hashes are passed on as strings, which is the form that one-shot
    // hashes are fastest to come by.
    outer.write(hash('sha256', inner.subarray(0, offset), 'binary'), HASH_BLOCK_LENGTH, 'binary');
    result.write(hash('sha256', outer, 'binary'), 'binary');

    return result;
  }
}

/**
 * Encrypts and decrypts cell values with a column encryption key, using the
 * `AEAD_AES_256_CBC_HMAC_SHA256` algorithm (encrypt-then-MAC).
 *
 * What is derived from the column encryption key is costly to set up, so
 * one instance is meant to be reused for all values of a key.
 *
 * @see https://learn.microsoft.com/en-us/sql/relational-databases/security/encryption/always-encrypted-cryptography
 */
export class ColumnEncryptionCipher {
  declare private readonly encryptionKey: KeyObject;
  declare private readonly mac: HmacSha256;
  declare private readonly iv: HmacSha256;

  // Decrypts the values of all cells, see `decrypt`.
  declare private readonly decipher: Decipheriv;

  constructor(columnEncryptionKey: Buffer) {
    if (columnEncryptionKey.length !== KEY_LENGTH) {
      throw new Error(`A column encryption key for ${ALGORITHM_NAME} must be ${KEY_LENGTH} bytes long, but the key is ${columnEncryptionKey.length} bytes long.`);
    }

    this.encryptionKey = createSecretKey(deriveKey(columnEncryptionKey, 'encryption'));
    this.mac = new HmacSha256(deriveKey(columnEncryptionKey, 'MAC'));
    this.iv = new HmacSha256(deriveKey(columnEncryptionKey, 'IV'));

    this.decipher = createDecipheriv('aes-256-cbc', this.encryptionKey, Buffer.alloc(BLOCK_LENGTH)).setAutoPadding(false);
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
      this.iv.digest(plaintext).copy(iv, 0, 0, BLOCK_LENGTH);
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

    // Most encrypted values are short, and setting up a cipher for each of
    // them would take much longer than decrypting their few blocks. A single
    // cipher does for all of them: CBC decrypts a block using nothing but
    // the block of ciphertext before it - the IV, for the first block. With
    // the IV in front of the ciphertext, what the cipher decrypted before
    // does not matter, and only the block that the IV itself is decrypted
    // to is of no use.
    const blocks = this.decipher.update(cell.subarray(IV_OFFSET));

    // The cipher is never finalized, so the padding is removed here.
    const paddingLength = blocks[blocks.length - 1];
    if (paddingLength < 1 || paddingLength > BLOCK_LENGTH) {
      throw new Error('The encrypted value has an invalid padding.');
    }

    return blocks.subarray(BLOCK_LENGTH, blocks.length - paddingLength);
  }

  /**
   * Computes the MAC of a cell: over its version, IV and ciphertext, and
   * the length of the version.
   */
  private computeMac(cell: Buffer): Buffer {
    return this.mac.digest(cell, IV_OFFSET, VERSION_BYTES, VERSION_LENGTH_BYTES);
  }
}
