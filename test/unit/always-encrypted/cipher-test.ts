import { assert } from 'chai';
import crypto from 'crypto';
import sinon from 'sinon';

import { ALGORITHM_ID, ALGORITHM_NAME, ColumnEncryptionCipher } from '../../../src/always-encrypted/cipher';

describe('ColumnEncryptionCipher', function() {
  // Values that were encrypted by Microsoft's drivers.
  const columnEncryptionKey = Buffer.from('ED6FBC93EECDE0BFC6494FFB2EDB7998B7E94EF71FEDE584741A855238F0155E', 'hex');

  const deterministic = {
    plaintext: Buffer.from('val_determ_1', 'utf16le'),
    cell: Buffer.from('01FF7225AFAD66E77407B12830D160B8BBFC7E5D3DE93B76EB3F3DEC8A8939474D1671AD4BC7581B57BB02B8E2ED33ECA604F1C513C98FE09F2C6FB1517B9F32BCF743FEF572EBF06AD0CE603B8D67D17A', 'hex')
  };

  const randomized = {
    plaintext: Buffer.from('val_rand_2', 'utf16le'),
    iv: Buffer.from('EA7774AA98A2057C89941A7DD60E5272', 'hex'),
    cell: Buffer.from('01800066F289EF215A964C9D9B8E76E9D9189CC7B2DADEF261AE83C3AB62EC4160EA7774AA98A2057C89941A7DD60E5272C191A85FE166937F7F94449F52D7640560C68E0FBD00E9084C0B54206C2190EC', 'hex')
  };

  let cipher: ColumnEncryptionCipher;

  beforeEach(function() {
    cipher = new ColumnEncryptionCipher(columnEncryptionKey);
  });

  afterEach(function() {
    sinon.restore();
  });

  it('identifies the algorithm the way SQL Server does', function() {
    assert.strictEqual(ALGORITHM_ID, 2);
    assert.strictEqual(ALGORITHM_NAME, 'AEAD_AES_256_CBC_HMAC_SHA256');
  });

  it('rejects column encryption keys that are not 256 bits long', function() {
    for (const length of [0, 16, 31, 33, 64]) {
      assert.throws(() => {
        new ColumnEncryptionCipher(Buffer.alloc(length));
      }, `A column encryption key for AEAD_AES_256_CBC_HMAC_SHA256 must be 32 bytes long, but the key is ${length} bytes long.`);
    }
  });

  describe('#encrypt', function() {
    it('encrypts a value with deterministic encryption', function() {
      assert.deepEqual(cipher.encrypt(deterministic.plaintext, true), deterministic.cell);
    });

    it('encrypts a value with randomized encryption', function() {
      sinon.stub(crypto, 'randomFillSync').callsFake(((buffer: Buffer) => {
        randomized.iv.copy(buffer);
        return buffer;
      }) as any);

      assert.deepEqual(cipher.encrypt(randomized.plaintext, false), randomized.cell);
    });

    it('encrypts equal values to equal cells with deterministic encryption', function() {
      const value = crypto.randomBytes(40);

      assert.deepEqual(cipher.encrypt(value, true), cipher.encrypt(Buffer.from(value), true));
      assert.notDeepEqual(cipher.encrypt(value, true), cipher.encrypt(crypto.randomBytes(40), true));
    });

    it('encrypts equal values to different cells with randomized encryption', function() {
      const value = crypto.randomBytes(40);

      assert.notDeepEqual(cipher.encrypt(value, false), cipher.encrypt(value, false));
    });

    it('pads values to the next multiple of the block size', function() {
      for (const [length, ciphertextLength] of [[0, 16], [1, 16], [15, 16], [16, 32], [17, 32], [32, 48]]) {
        assert.lengthOf(cipher.encrypt(Buffer.alloc(length), true), 1 + 32 + 16 + ciphertextLength);
      }
    });

    it('does not modify the value', function() {
      const value = crypto.randomBytes(40);
      const copy = Buffer.from(value);

      cipher.encrypt(value, true);
      cipher.encrypt(value, false);

      assert.deepEqual(value, copy);
    });
  });

  describe('#decrypt', function() {
    it('decrypts a value that was encrypted with deterministic encryption', function() {
      assert.deepEqual(cipher.decrypt(deterministic.cell), deterministic.plaintext);
    });

    it('decrypts a value that was encrypted with randomized encryption', function() {
      assert.deepEqual(cipher.decrypt(randomized.cell), randomized.plaintext);
    });

    it('decrypts what it encrypted', function() {
      for (let length = 0; length <= 100; length++) {
        const value = crypto.randomBytes(length);

        assert.deepEqual(cipher.decrypt(cipher.encrypt(value, true)), value, `value of ${length} bytes`);
        assert.deepEqual(cipher.decrypt(cipher.encrypt(value, false)), value, `value of ${length} bytes`);
      }
    });

    it('decrypts large values', function() {
      const value = crypto.randomBytes(1024 * 1024 + 5);

      assert.deepEqual(cipher.decrypt(cipher.encrypt(value, false)), value);
    });

    it('decrypts a cell that is part of a larger buffer', function() {
      const buffer = Buffer.concat([crypto.randomBytes(7), deterministic.cell, crypto.randomBytes(7)]);

      assert.deepEqual(cipher.decrypt(buffer.subarray(7, 7 + deterministic.cell.length)), deterministic.plaintext);
    });

    it('does not modify the cell', function() {
      const cell = Buffer.from(deterministic.cell);
      cipher.decrypt(cell);

      assert.deepEqual(cell, deterministic.cell);
    });

    it('rejects cells with an invalid length', function() {
      for (const length of [0, 1, 48, 64, 66, 80]) {
        assert.throws(() => {
          cipher.decrypt(deterministic.cell.subarray(0, length));
        }, `The encrypted value has an invalid length of ${length} bytes.`);
      }
    });

    it('rejects cells with an unsupported algorithm version', function() {
      const cell = Buffer.from(deterministic.cell);
      cell[0] = 0x02;

      assert.throws(() => {
        cipher.decrypt(cell);
      }, 'The encrypted value has an unsupported algorithm version 0x02.');
    });

    it('rejects cells that were tampered with', function() {
      // Any bit of the authentication tag, the IV and the ciphertext
      for (const offset of [1, 32, 33, 48, 49, deterministic.cell.length - 1]) {
        const cell = Buffer.from(deterministic.cell);
        cell[offset] ^= 0x01;

        assert.throws(() => {
          cipher.decrypt(cell);
        }, 'The encrypted value has an invalid authentication tag.');
      }
    });

    it('rejects cells that were encrypted with a different key', function() {
      const other = new ColumnEncryptionCipher(crypto.randomBytes(32));

      assert.throws(() => {
        other.decrypt(deterministic.cell);
      }, 'The encrypted value has an invalid authentication tag.');
    });
  });
});
