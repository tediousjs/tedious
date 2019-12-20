const { createCipheriv, createHmac } = require('crypto');

const {
  deriveKey,
  generateKeySalt,
} = require('../../../src/always-encrypted/SQLServerAeadAes256CbcHmac256EncryptionKey');

const algorithmName = 'AEAD_AES_256_CBC_HMAC_SHA256';
const keySize = 256;

// const blockSizeInBytes = 16;
const algorithmVersion = 0x01;
const algorithmVersionSize = 0x01;

function deriveEncryptionKey(rootKey) {
  const salt = generateKeySalt('encryption', algorithmName, keySize);
  return deriveKey(rootKey, salt);
}

function deriveIVKey(rootKey) {
  const salt = generateKeySalt('IV', algorithmName, keySize);
  return deriveKey(rootKey, salt);
}

function deriveMACKey(rootKey) {
  const salt = generateKeySalt('MAC', algorithmName, keySize);
  return deriveKey(rootKey, salt);
}

function generateCipherText(rootKey, iv, plainText) {
  const encryptionKey = deriveEncryptionKey(rootKey);
  const cipher = createCipheriv('aes-256-cbc', encryptionKey, iv);

  return Buffer.from([
    ...cipher.update(plainText),
    ...cipher.final(),
  ]);
}

function generateAuthenticationTag(rootKey, iv, cipherText) {
  const macKey = deriveMACKey(rootKey);
  const hmac = createHmac('sha256', macKey);
  hmac.update(Buffer.from([algorithmVersion]));
  hmac.update(iv);
  hmac.update(cipherText);
  hmac.update(Buffer.from([algorithmVersionSize]));
  return hmac.digest();
}

function generateEncryptedVarBinary(rootKey, iv, plainText) {
  const cipherText = generateCipherText(rootKey, iv, plainText);
  const authenticationTag = generateAuthenticationTag(rootKey, iv, cipherText);

  return Buffer.from([
    algorithmVersion,
    ...authenticationTag,
    ...iv,
    ...cipherText,
  ]);
}

module.exports = {
  algorithmName,
  deriveEncryptionKey,
  deriveIVKey,
  deriveMACKey,

  generateEncryptedVarBinary,
};
