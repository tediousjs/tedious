const NTLMPayload = require('../../../src/ntlm-payload');

const challenge = {
  domain: 'domain',
  userName: 'username',
  password: 'password',
  ntlmpacket: {
    target: Buffer.from([170, 170, 170, 170]), // aa aa aa aa
    nonce: Buffer.from([187, 187, 187, 187, 187, 187, 187, 187])
  }
};

new NTLMPayload(challenge);
