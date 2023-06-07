// This code is based on the `mssql-jdbc` library published under the conditions of MIT license.
// Copyright (c) 2019 Microsoft Corporation

import { EncryptionAlgorithm, SQLServerEncryptionType } from './types';
import { createHmac, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { AeadAes256CbcHmac256EncryptionKey, keySize } from './aead-aes-256-cbc-hmac-encryption-key';

export const algorithmName = 'AEAD_AES_256_CBC_HMAC_SHA256';
const algorithmVersion = 0x1;
const blockSizeInBytes = 16;

export class AeadAes256CbcHmac256Algorithm implements EncryptionAlgorithm {
  private columnEncryptionkey: AeadAes256CbcHmac256EncryptionKey;
  private isDeterministic: boolean;
  private keySizeInBytes: number;
  private version: Buffer;
  private versionSize: Buffer;
  private minimumCipherTextLengthInBytesNoAuthenticationTag: number;
  private minimumCipherTextLengthInBytesWithAuthenticationTag: number;

  constructor(columnEncryptionKey: AeadAes256CbcHmac256EncryptionKey, encryptionType: SQLServerEncryptionType) {
    this.keySizeInBytes = keySize / 8;
    this.version = Buffer.from([algorithmVersion]);
    this.versionSize = Buffer.from([1]);
    this.minimumCipherTextLengthInBytesNoAuthenticationTag = 1 + blockSizeInBytes + blockSizeInBytes;
    this.minimumCipherTextLengthInBytesWithAuthenticationTag = this.minimumCipherTextLengthInBytesNoAuthenticationTag + this.keySizeInBytes;
    this.columnEncryptionkey = columnEncryptionKey;

    this.isDeterministic = encryptionType === SQLServerEncryptionType.Deterministic;
  }

  encryptData(plaintText: Buffer): Buffer {
    let iv: Buffer;

    if (this.isDeterministic === true) {
      const hmacIv = createHmac('sha256', this.columnEncryptionkey.getIvKey());
      hmacIv.update(plaintText);
      iv = hmacIv.digest().slice(0, blockSizeInBytes);
    } else {
      iv = randomBytes(blockSizeInBytes);
    }

    const encryptCipher = createCipheriv('aes-256-cbc', this.columnEncryptionkey.getEncryptionKey(), iv);

    const encryptedBuffer = Buffer.concat([encryptCipher.update(plaintText), encryptCipher.final()]);

    const authenticationTag: Buffer = this._prepareAuthenticationTag(iv, encryptedBuffer, 0, encryptedBuffer.length);

    return Buffer.concat([Buffer.from([algorithmVersion]), authenticationTag, iv, encryptedBuffer]);
  }

  decryptData(cipherText: Buffer): Buffer {
    const iv: Buffer = Buffer.alloc(blockSizeInBytes);

    const minimumCiperTextLength: number = this.minimumCipherTextLengthInBytesWithAuthenticationTag;

    if (cipherText.length < minimumCiperTextLength) {
      throw new Error(`Specified ciphertext has an invalid size of ${cipherText.length} bytes, which is below the minimum ${minimumCiperTextLength} bytes required for decryption.`);
    }

    let startIndex = 0;
    if (cipherText[0] !== algorithmVersion) {
      throw new Error(`The specified ciphertext's encryption algorithm version ${Buffer.from([cipherText[0]]).toString('hex')} does not match the expected encryption algorithm version ${algorithmVersion}.`);
    }

    startIndex += 1;
    let authenticationTagOffset = 0;

    authenticationTagOffset = startIndex;
    startIndex += this.keySizeInBytes;

    cipherText.copy(iv, 0, startIndex, startIndex + iv.length);
    startIndex += iv.length;

    const cipherTextOffset = startIndex;
    const cipherTextCount = cipherText.length - startIndex;

    const authenticationTag: Buffer = this._prepareAuthenticationTag(iv, cipherText, cipherTextOffset, cipherTextCount);

    if (0 !== authenticationTag.compare(cipherText, authenticationTagOffset, Math.min(authenticationTagOffset + cipherTextCount, authenticationTagOffset + authenticationTag.length), 0, Math.min(cipherTextCount, authenticationTag.length))) {
      throw new Error('Specified ciphertext has an invalid authentication tag.');
    }

    let plainText: Buffer;

    const decipher = createDecipheriv('aes-256-cbc', this.columnEncryptionkey.getEncryptionKey(), iv);
    try {
      plainText = decipher.update(cipherText.slice(cipherTextOffset, cipherTextOffset + cipherTextCount));
      plainText = Buffer.concat([plainText, decipher.final()]);
    } catch (error: any) {
      throw new Error(`Internal error while decryption: ${error.message}`);
    }

    return plainText;
  }

  _prepareAuthenticationTag(iv: Buffer, cipherText: Buffer, offset: number, length: number): Buffer {
    const hmac = createHmac('sha256', this.columnEncryptionkey.getMacKey());

    hmac.update(this.version);
    hmac.update(iv);
    hmac.update(cipherText.slice(offset, offset + length));
    hmac.update(this.versionSize);
    return hmac.digest();
  }
}
