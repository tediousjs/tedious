const assert = require('chai').assert;
const { AeadAes256CbcHmac256EncryptionKey } = require('../../../src/always-encrypted/aead-aes-256-cbc-hmac-encryption-key');
const { algorithmName } = require('./crypto-util');

describe('aead-aes-256-cbc-hmac-encryption-key', () => {
  const sampleRootKey = Buffer.from('ED6FBC93EECDE0BFC6494FFB2EDB7998B7E94EF71FEDE584741A855238F0155E', 'hex');

  it('constructs', () => {
    const encryptionKey = new AeadAes256CbcHmac256EncryptionKey(sampleRootKey, algorithmName);

    assert.deepEqual(encryptionKey.rootKey, sampleRootKey);
    assert.deepEqual(encryptionKey.getEncryptionKey(), Buffer.from('561776D3B78B732A6AE06021FD262E41083F4767B16033E11448A552A44B6A27', 'hex'));
    assert.deepEqual(encryptionKey.getMacKey(), Buffer.from('C0AC8ECBE7A488D628EC3AA33023B2D7C05BF6BE76521E5CD0AE89D38ACDB674', 'hex'));
    assert.deepEqual(encryptionKey.getIvKey(), Buffer.from('0832D643924BFDE0B383A60B758A56C008CD56129818EE27F6CD38F2532149BC', 'hex'));
  });
});
