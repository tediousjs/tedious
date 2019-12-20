const assert = require('chai').assert;
const sinon = require('sinon');
const { AeadAes256CbcHmac256Algorithm } = require('../../../src/always-encrypted/aead-aes-256-cbc-hmac-algorithm');
const { AeadAes256CbcHmac256EncryptionKey } = require('../../../src/always-encrypted/aead-aes-256-cbc-hmac-encryption-key');
const { SQLServerEncryptionType } = require('../../../src/always-encrypted/types');
const crypto = require('crypto');
const { algorithmName } = require('./crypto-util');

describe('aead-aes-256-cbc-hmac-algorithm', () => {
  const sampleRootKey = Buffer.from('ED6FBC93EECDE0BFC6494FFB2EDB7998B7E94EF71FEDE584741A855238F0155E', 'hex');
  const iv = Buffer.from('EA7774AA98A2057C89941A7DD60E5272', 'hex');

  it('constructs class', () => {
    const encryptionKey = new AeadAes256CbcHmac256EncryptionKey(sampleRootKey, algorithmName);
    const algorithm = new AeadAes256CbcHmac256Algorithm(encryptionKey, SQLServerEncryptionType.Deterministic);

    assert.strictEqual(algorithm.isDeterministic, true);
    assert.deepEqual(algorithm.columnEncryptionkey, encryptionKey);
    assert.strictEqual(algorithm.blockSizeInBytes, 16);
    assert.strictEqual(algorithm.keySizeInBytes, 32);
    assert.deepEqual(algorithm.version, Buffer.from([0x01]));
    assert.deepEqual(algorithm.versionSize, Buffer.from([1]));
    assert.strictEqual(algorithm.minimumCipherTextLengthInBytesNoAuthenticationTag, 33);
    assert.strictEqual(algorithm.minimumCipherTextLengthInBytesWithAuthenticationTag, 65);
    assert.deepEqual(algorithm.algorithmVersion, Buffer.from([0x1]));
  });

  it('encrypts data with deterministic initialization vector', () => {
    const encryptionKey = new AeadAes256CbcHmac256EncryptionKey(sampleRootKey, algorithmName);
    const algorithm = new AeadAes256CbcHmac256Algorithm(encryptionKey, SQLServerEncryptionType.Deterministic);

    const plaintext = Buffer.from('760061006C005F00640065007400650072006D005F003100', 'hex');
    const cipherText = algorithm.encryptData(plaintext);

    assert.deepEqual(cipherText, Buffer.from('01FF7225AFAD66E77407B12830D160B8BBFC7E5D3DE93B76EB3F3DEC8A8939474D1671AD4BC7581B57BB02B8E2ED33ECA604F1C513C98FE09F2C6FB1517B9F32BCF743FEF572EBF06AD0CE603B8D67D17A', 'hex'));
  });

  it('encrypts data with randomized initialization vector', () => {
    const encryptionKey = new AeadAes256CbcHmac256EncryptionKey(sampleRootKey, algorithmName);
    const algorithm = new AeadAes256CbcHmac256Algorithm(encryptionKey, SQLServerEncryptionType.Randomized);

    const plaintext = Buffer.from('760061006C005F00720061006E0064005F003200', 'hex');
    const stub = sinon.stub(crypto, 'randomBytes').returns(iv);
    const cipherText = algorithm.encryptData(plaintext);
    stub.restore();
    assert.deepEqual(cipherText, Buffer.from('01800066F289EF215A964C9D9B8E76E9D9189CC7B2DADEF261AE83C3AB62EC4160EA7774AA98A2057C89941A7DD60E5272C191A85FE166937F7F94449F52D7640560C68E0FBD00E9084C0B54206C2190EC', 'hex'));
  });

  it('encrypts data then decrypts it with deterministic initialization vector', () => {
    const encryptionKey = new AeadAes256CbcHmac256EncryptionKey(sampleRootKey, algorithmName);
    const algorithm = new AeadAes256CbcHmac256Algorithm(encryptionKey, SQLServerEncryptionType.Deterministic);

    const plaintext = crypto.randomBytes(20);
    const cipherText = algorithm.encryptData(plaintext);
    const decryptedPlainText = algorithm.decryptData(cipherText);

    assert.deepEqual(decryptedPlainText, plaintext);
  });

  it('encrypts data then decrypts it with randomized initialization vector', () => {
    const encryptionKey = new AeadAes256CbcHmac256EncryptionKey(sampleRootKey, algorithmName);
    const algorithm = new AeadAes256CbcHmac256Algorithm(encryptionKey, SQLServerEncryptionType.Randomized);

    const plaintext = crypto.randomBytes(20);
    const stub = sinon.stub(crypto, 'randomBytes').returns(iv);
    const cipherText = algorithm.encryptData(plaintext);
    stub.restore();
    const decryptedPlainText = algorithm.decryptData(cipherText);

    assert.deepEqual(decryptedPlainText, plaintext);
  });
});
