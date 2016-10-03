'use strict';

var NTLMPayload;

NTLMPayload = require('../../src/ntlm-payload');

exports.respondToChallenge = function(test) {
  var challenge, domainName, expectedLength, response, targetData, userName;
  challenge = {
    domain: 'domain',
    userName: 'username',
    password: 'password',
    ntlmpacket: {
      target: new Buffer([170, 170, 170, 170]),
      nonce: new Buffer([187, 187, 187, 187, 187, 187, 187, 187])
    }
  };
  response = new NTLMPayload(challenge);
  expectedLength = 8 + 4 + 8 + 8 + 8 + 8 + 16 + 4 + (2 * 6) + (2 * 8) + 24 + 16 + 8 + 8 + 8 + 4 + 4 + 4;
  domainName = response.data.slice(64, 76).toString('ucs2');
  userName = response.data.slice(76, 92).toString('ucs2');
  targetData = response.data.slice(160, 164).toString('hex');
  test.strictEqual(domainName, 'domain');
  test.strictEqual(userName, 'username');
  test.strictEqual(targetData, 'aaaaaaaa');
  test.strictEqual(expectedLength, response.data.length);
  return test.done();
};
