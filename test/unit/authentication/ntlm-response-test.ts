import NTLMPayload, { type Md4 } from '../../../src/authentication/legacy/ntlm-response';
import { assert } from 'chai';
import md4Lib from 'js-md4';

const md4: Md4 = (data) => Buffer.from(md4Lib.arrayBuffer(data));

const challenge = {
  domain: 'domain',
  userName: 'username',
  password: 'password',
  ntlmpacket: {
    target: Buffer.from([170, 170, 170, 170]), // aa aa aa aa
    nonce: Buffer.from([187, 187, 187, 187, 187, 187, 187, 187])
  }
};

describe('NTLMPayload', function() {
  it('should respond to challenge', function() {

    const response = new NTLMPayload(challenge, md4);

    const expectedLength =
      8 + // NTLM protocol header
      4 + // NTLM message type
      8 + // lmv index
      8 + // ntlm index
      8 + // domain index
      8 + // user index
      16 + // header index
      4 + // flags
      2 * 6 + // domain
      2 * 8 + // username
      24 + // lmv2 data
      16 + // ntlmv2 data
      8 + // flags
      8 + // timestamp
      8 + // client nonce
      4 + // placeholder
      4 + // target data
      4; // placeholder

    const domainName = response.data.slice(64, 76).toString('ucs2');
    const userName = response.data.slice(76, 92).toString('ucs2');
    const targetData = response.data.slice(160, 164).toString('hex');

    assert.strictEqual(domainName, 'domain');
    assert.strictEqual(userName, 'username');
    assert.strictEqual(targetData, 'aaaaaaaa');

    assert.strictEqual(expectedLength, response.data.length);
  });

  it('computes the NT hash using the given MD4 implementation', function() {
    const response = new NTLMPayload(challenge, md4);

    // The NT hash of "password" (MD4 of its UTF-16LE encoding).
    assert.strictEqual(response.ntHash('password').toString('hex'), '8846f7eaee8fb117ad06bdd830b7586c');
  });
});
