import { assert } from 'chai';
import { createNTLMRequest } from '../../src/ntlm';

describe('createNTLMRequest', function() {
  it('returns a Buffer with an NTLM request message', function() {
    const data = createNTLMRequest({ domain: 'domain', workstation: 'workstation' });

    assert.instanceOf(data, Buffer);
    assert.strictEqual(data.length, 57);

    const protocolHeader = data.toString('ascii', 0, 8);
    assert.strictEqual(protocolHeader, 'NTLMSSP\u0000');

    const workstationName = data.toString('ascii', 40, 51);
    assert.strictEqual(workstationName, 'WORKSTATION');

    const domainName = data.toString('ascii', 51, 57);
    assert.strictEqual(domainName, 'DOMAIN');
  });
});
