const Parser = require('../../../src/token/stream-parser');
const WriteBuffer = require('../../../src/tracking-buffer/writable-tracking-buffer');
const assert = require('chai').assert;

describe('sspi token parser', () => {
  it('should parse challenge', () => {
    const source = new WriteBuffer(68);
    source.writeUInt8(0xed);
    source.writeUInt16LE(0);
    source.writeString('NTLMSSP\0', 'utf8');
    source.writeInt32LE(2); // message type
    source.writeInt16LE(12); // domain len
    source.writeInt16LE(12); // domain max
    source.writeInt32LE(111); // domain offset
    source.writeInt32LE(11256099); // flags == 'abc123'
    source.copyFrom(Buffer.from([0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6, 0xa7, 0xb8])); // nonce
    source.copyFrom(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])); // empty
    source.writeInt16LE(4); // target len
    source.writeInt16LE(4); // target max
    source.writeInt32LE(222); // target offset
    source.copyFrom(Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])); // odd data
    source.writeString('domain', 'ucs2'); // domain
    source.writeInt32BE(11259375); // target == 'abcdef'

    const parser = new Parser({ token() { } }, {}, {});
    const data = source.data;
    data.writeUInt16LE(data.length - 3, 1);
    parser.write(data);
    const challenge = parser.read();

    const expected = {
      magic: 'NTLMSSP\0',
      type: 2,
      domainLen: 12,
      domainMax: 12,
      domainOffset: 111,
      flags: 11256099,
      nonce: Buffer.from([0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6, 0xa7, 0xb8]),
      zeroes: Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      targetLen: 4,
      targetMax: 4,
      targetOffset: 222,
      oddData: Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]),
      domain: 'domain',
      target: Buffer.from([0x00, 0xab, 0xcd, 0xef])
    };

    assert.deepEqual(challenge.ntlmpacket, expected);

    // Skip token (first byte) and length of VarByte (2 bytes).
    assert.isOk(challenge.ntlmpacketBuffer.equals(data.slice(3)));
  });
});
