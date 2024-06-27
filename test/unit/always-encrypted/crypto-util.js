const { createCipheriv, createHmac } = require('crypto');

const {
  deriveKey,
  generateKeySalt,
} = require('../../../src/always-encrypted/aead-aes-256-cbc-hmac-encryption-key');

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

const options = {
  useUTC: false,
  tdsVersion: '7_2'
};

const alwaysEncryptedAlgorithmName = 'AEAD_AES_256_CBC_HMAC_SHA256';
const alwaysEncryptedCEK = Buffer.from([
  // decrypted column key must be 32 bytes long for AES256
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);
const alwaysEncryptedIV = Buffer.from([
  0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11,
  0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11,
]);
// pre-calculated constants, mostly for debugging purposes
const alwaysEncryptedConstants = {
  // root key is the decrypted column encryption key
  // it is arbitrary, but must be 32 bytes long for AES256
  // rootKey: 0000000000000000000000000000000000000000000000000000000000000000
  rootKey: Buffer.from([ ...alwaysEncryptedCEK ]),

  // iv is the initialization vector used when encrypting plaintext
  // it is arbitrary, but must be 16 bytes long for AES256
  // iv: 11111111111111111111111111111111
  iv: Buffer.from([ ...alwaysEncryptedIV ]),

  // derived keys must use the root key above, and the appropriate key salt
  // format as the input data
  // e.g. to get the MAC key, run something like this:
  // echo -n \
  //     "Microsoft SQL Server cell MAC key with encryption" \
  //     "algorithm:AEAD_AES_256_CBC_HMAC_SHA256 and key length:256" | \
  //   iconv -f 'UTF-8' -t 'UTF-16LE' | \
  //   openssl dgst \
  //     -sha256 -mac HMAC \
  //     -macopt hexkey:'0000000000000000000000000000000000000000000000000000000000000000'
  // # 9d1f2295e509519ed0f1bff77659713280a3651fa2d7a7023abd1ba519012573

  // encryptionKey: 02c735a87529f1d1eb3853852c2a45cf667331dda269c18feac9aec29675b349
  // encryptionKey: Buffer.from([
  //   0x02, 0xC7, 0x35, 0xA8, 0x75, 0x29, 0xF1, 0xD1,
  //   0xEB, 0x38, 0x53, 0x85, 0x2C, 0x2A, 0x45, 0xCF,
  //   0x66, 0x73, 0x31, 0xDD, 0xA2, 0x69, 0xC1, 0x8F,
  //   0xEA, 0xC9, 0xAE, 0xC2, 0x96, 0x75, 0xB3, 0x49,
  // ]),
  encryptionKey: deriveEncryptionKey(alwaysEncryptedCEK),

  // macKey: 9d1f2295e509519ed0f1bff77659713280a3651fa2d7a7023abd1ba519012573
  // macKey: Buffer.from([
  //   0x9D, 0x1F, 0x22, 0x95, 0xE5, 0x09, 0x51, 0x9E,
  //   0xD0, 0xF1, 0xBF, 0xF7, 0x76, 0x59, 0x71, 0x32,
  //   0x80, 0xA3, 0x65, 0x1F, 0xA2, 0xD7, 0xA7, 0x02,
  //   0x3A, 0xBD, 0x1B, 0xA5, 0x19, 0x01, 0x25, 0x73,
  // ]),
  macKey: deriveMACKey(alwaysEncryptedCEK),

  // ivKey: e45dfdea81075d68ef80e4eee4cee69f55b5dd96c8d1d9afbcc895f0c17e2bcb
  // ivKey: Buffer.from([
  //   0xE4, 0x5D, 0xFD, 0xEA, 0x81, 0x07, 0x5D, 0x68,
  //   0xEF, 0x80, 0xE4, 0xEE, 0xE4, 0xCE, 0xE6, 0x9F,
  //   0x55, 0xB5, 0xDD, 0x96, 0xC8, 0xD1, 0xD9, 0xAF,
  //   0xBC, 0xC8, 0x95, 0xF0, 0xC1, 0x7E, 0x2B, 0xCB,
  // ]),
  ivKey: deriveIVKey(alwaysEncryptedCEK),
};

const alwaysEncryptedOptions = {
  ...options,
  serverSupportsColumnEncryption: true,
  trustedServerNameAE: 'localhost',
  encryptionKeyStoreProviders: {
    'TEST_KEYSTORE': {
      decryptColumnEncryptionKey: () => Promise.resolve(alwaysEncryptedCEK),
    },
  },
};
const cryptoMetadata = {
  cekEntry: {
    ordinal: 0x01,
    databaseId: 0x00,
    cekId: 0x00,
    cekVersion: 0x00,
    cekMdVersion: 0x00,
    columnEncryptionKeyValues: [{
      encryptedKey: Buffer.from([ 0x00 ]),
      dbId: 0x05,
      keyId: 0x31,
      keyVersion: 0x01,
      mdVersion: Buffer.from([
        0xF1, 0x08, 0x60, 0x01, 0xE8, 0xAA, 0x00, 0x00,
      ]),
      keyPath: 'test',
      keyStoreName: 'TEST_KEYSTORE',
      algorithmName: 'RSA_OAEP',
    }],
  },
  cipherAlgorithmId: 0x02,
  encryptionType: 0x01,
  normalizationRuleVersion: Buffer.from([ 0x01 ]),
};

module.exports = {
  algorithmName,
  deriveEncryptionKey,
  deriveIVKey,
  deriveMACKey,

  generateEncryptedVarBinary,

  alwaysEncryptedCEK,
  alwaysEncryptedIV,
  alwaysEncryptedAlgorithmName,
  alwaysEncryptedConstants,
  alwaysEncryptedOptions,
  cryptoMetadata,
};
