import { SQLServerEncryptionAlgorithm, SQLServerEncryptionType } from './types';
import { createHmac, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { SQLServerAeadAes256CbcHmac256EncryptionKey, keySize } from './SQLServerAeadAes256CbcHmac256EncryptionKey';

export const algorithmName = 'AEAD_AES_256_CBC_HMAC_SHA256';

export class SQLServerAeadAes256CbcHmac256Algorithm implements SQLServerEncryptionAlgorithm {
  private columnEncryptionkey: SQLServerAeadAes256CbcHmac256EncryptionKey;
  private algorithmVersion: Buffer;
  private isDeterministic: boolean;
  private blockSizeInBytes: number;
  private keySizeInBytes: number;
  private version: Buffer;
  private versionSize: Buffer;
  private minimumCipherTextLengthInBytesNoAuthenticationTag: number;
  private minimumCipherTextLengthInBytesWithAuthenticationTag: number;

  constructor(columnEncryptionKey: SQLServerAeadAes256CbcHmac256EncryptionKey, encryptionType: SQLServerEncryptionType) {
    this.isDeterministic = false;
    this.blockSizeInBytes = 16;
    this.keySizeInBytes = keySize / 8;
    this.version = Buffer.from([0x01]);
    this.versionSize = Buffer.from([1]);
    this.minimumCipherTextLengthInBytesNoAuthenticationTag = 1 + this.blockSizeInBytes + this.blockSizeInBytes;
    this.minimumCipherTextLengthInBytesWithAuthenticationTag = this.minimumCipherTextLengthInBytesNoAuthenticationTag + this.keySizeInBytes;
    this.algorithmVersion = Buffer.from([0x1]);
    this.columnEncryptionkey = columnEncryptionKey;

    if (encryptionType === SQLServerEncryptionType.Deterministic) {
      this.isDeterministic = true;
    }
    this.version = Buffer.from(this.algorithmVersion);
  }

  encryptData(plaintText: Buffer): Buffer {
    const hasAuthenticationTag = true;
    let iv: Buffer;

    if (this.isDeterministic === true) {
      try {
        const hmacIv = createHmac('sha256', this.columnEncryptionkey.getIvKey());
        hmacIv.update(plaintText);
        iv = hmacIv.digest().slice(0, this.blockSizeInBytes);
      } catch (error) {
        throw new Error(`Internal error while encryption: ${error.message}`);
      }
    } else {
      iv = randomBytes(this.blockSizeInBytes);
    }

    const numBlocks = Math.floor(plaintText.length / this.blockSizeInBytes) + 1;

    const hmacStartIndex = 1;
    const authenticationTagLen = hasAuthenticationTag ? this.keySizeInBytes : 0;
    const ivStartIndex = hmacStartIndex + authenticationTagLen;
    const cipherStartIndex = ivStartIndex + this.blockSizeInBytes;

    const outputBuffSize = 1 + authenticationTagLen + iv.length + (numBlocks * this.blockSizeInBytes);
    const outBuffer: Buffer = Buffer.alloc(outputBuffSize);

    outBuffer.fill(this.algorithmVersion, 0, 1);

    iv.copy(outBuffer, ivStartIndex, 0, iv.length);

    try {
      const encryptCipher = createCipheriv('aes-256-cbc', this.columnEncryptionkey.getEncryptionKey(), iv);
      let count = 0;
      let cipherIndex = cipherStartIndex;

      if (numBlocks > 1) {
        count = (numBlocks - 1) * this.blockSizeInBytes;

        encryptCipher.update(plaintText.slice(0, count)).copy(outBuffer, cipherIndex, 0, count);

        cipherIndex += count;
      }

      let buffTmp = encryptCipher.update(plaintText.slice(count, plaintText.length));

      buffTmp = Buffer.concat([buffTmp, encryptCipher.final()]);

      buffTmp.copy(outBuffer, cipherIndex, 0, buffTmp.length);
      if (hasAuthenticationTag) {
        const hmac = createHmac('sha256', this.columnEncryptionkey.getMacKey());
        hmac.update(this.version);
        hmac.update(iv);
        hmac.update(outBuffer.slice(cipherStartIndex, (numBlocks * this.blockSizeInBytes) + cipherStartIndex));
        hmac.update(this.versionSize);
        const hash = hmac.digest();

        hash.copy(outBuffer, hmacStartIndex, 0, authenticationTagLen);
      }
    } catch (error) {
      throw new Error(`Internal error while encryption: ${error.message}`);
    }

    return outBuffer;
  }

  decryptData(cipherText: Buffer): Buffer {
    const hasAuthenticationTag = true;
    const iv: Buffer = Buffer.alloc(this.blockSizeInBytes);

    const minimumCiperTextLength: number = hasAuthenticationTag ? this.minimumCipherTextLengthInBytesWithAuthenticationTag : this.minimumCipherTextLengthInBytesNoAuthenticationTag;

    if (cipherText.length < minimumCiperTextLength) {
      throw new Error(`Specified ciphertext has an invalid size of ${cipherText.length} bytes, which is below the minimum ${minimumCiperTextLength} bytes required for decryption.`);
    }

    let startIndex = 0;
    if (cipherText[0] !== this.algorithmVersion[0]) {
      throw new Error(`The specified ciphertext's encryption algorithm version ${Buffer.from([cipherText[0]]).toString('hex')} does not match the expected encryption algorithm version ${this.algorithmVersion.toString('hex')}.`);
    }

    startIndex += 1;
    let authenticationTagOffset = 0;

    if (hasAuthenticationTag === true) {
      authenticationTagOffset = startIndex;
      startIndex += this.keySizeInBytes;
    }

    cipherText.copy(iv, 0, startIndex, startIndex + iv.length);
    startIndex += iv.length;

    const cipherTextOffset = startIndex;
    const cipherTextCount = cipherText.length - startIndex;

    if (hasAuthenticationTag === true) {
      let authenticationTag: Buffer;
      try {
        authenticationTag = this._prepareAuthenticationTag(iv, cipherText, cipherTextOffset, cipherTextCount);
      } catch (error) {
        throw new Error(`Internal error while decryption: ${error.message}`);
      }

      if (0 !== authenticationTag.compare(cipherText, authenticationTagOffset, Math.min(authenticationTagOffset + cipherTextCount, authenticationTagOffset + authenticationTag.length), 0, Math.min(cipherTextCount, authenticationTag.length))) {
        throw new Error('Specified ciphertext has an invalid authentication tag.');
      }
    }

    let plainText: Buffer;

    const decipher = createDecipheriv('aes-256-cbc', this.columnEncryptionkey.getEncryptionKey(), iv);
    try {
      plainText = decipher.update(cipherText.slice(cipherTextOffset, cipherTextOffset + cipherTextCount));
      plainText = Buffer.concat([plainText, decipher.final()]);
    } catch (error) {
      throw new Error(`Internal error while decryption: ${error.message}`);
    }

    return plainText;
  }

  _prepareAuthenticationTag(iv: Buffer, cipherText: Buffer, offset: number, length: number): Buffer {
    const authenticationTag: Buffer = Buffer.alloc(this.keySizeInBytes);

    const hmac = createHmac('sha256', this.columnEncryptionkey.getMacKey());

    hmac.update(this.version);
    hmac.update(iv);
    hmac.update(cipherText.slice(offset, offset + length));
    hmac.update(this.versionSize);
    const computedHash = hmac.digest();

    computedHash.copy(authenticationTag, 0, 0, authenticationTag.length);

    return authenticationTag;
  }
}
