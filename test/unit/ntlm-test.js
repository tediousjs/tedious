const { assert } = require('chai');

const { createNTLMRequest } = require('../../src/ntlm');

describe('createNTLMRequest', function() {
  it('returns a Buffer with an NTLM request message', function() {
    const data = createNTLMRequest({ domain: 'domain', workstation: 'workstation' });

    assert.instanceOf(data, Buffer);
    assert.strictEqual(data.length, 57);

    var protocolHeader = data.toString('ascii', 0, 8);
    assert.strictEqual(protocolHeader, 'NTLMSSP\u0000');

    var workstationName = data.toString('ascii', 40, 51);
    assert.strictEqual(workstationName, 'WORKSTATION');

    var domainName = data.toString('ascii', 51, 57);
    assert.strictEqual(domainName, 'DOMAIN');
  });
});
