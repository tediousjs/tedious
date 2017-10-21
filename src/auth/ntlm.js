const crypto = require('crypto');
const BigInteger = require('big-number').n;

const hex = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];

const NTLMFlags = {
  NTLM_NegotiateUnicode: 0x00000001,
  NTLM_NegotiateOEM: 0x00000002,
  NTLM_RequestTarget: 0x00000004,
  NTLM_Unknown9: 0x00000008,
  NTLM_NegotiateSign: 0x00000010,
  NTLM_NegotiateSeal: 0x00000020,
  NTLM_NegotiateDatagram: 0x00000040,
  NTLM_NegotiateLanManagerKey: 0x00000080,
  NTLM_Unknown8: 0x00000100,
  NTLM_NegotiateNTLM: 0x00000200,
  NTLM_NegotiateNTOnly: 0x00000400,
  NTLM_Anonymous: 0x00000800,
  NTLM_NegotiateOemDomainSupplied: 0x00001000,
  NTLM_NegotiateOemWorkstationSupplied: 0x00002000,
  NTLM_Unknown6: 0x00004000,
  NTLM_NegotiateAlwaysSign: 0x00008000,
  NTLM_TargetTypeDomain: 0x00010000,
  NTLM_TargetTypeServer: 0x00020000,
  NTLM_TargetTypeShare: 0x00040000,
  NTLM_NegotiateExtendedSecurity: 0x00080000,
  NTLM_NegotiateIdentify: 0x00100000,
  NTLM_Unknown5: 0x00200000,
  NTLM_RequestNonNTSessionKey: 0x00400000,
  NTLM_NegotiateTargetInfo: 0x00800000,
  NTLM_Unknown4: 0x01000000,
  NTLM_NegotiateVersion: 0x02000000,
  NTLM_Unknown3: 0x04000000,
  NTLM_Unknown2: 0x08000000,
  NTLM_Unknown1: 0x10000000,
  NTLM_Negotiate128: 0x20000000,
  NTLM_NegotiateKeyExchange: 0x40000000,
  NTLM_Negotiate56: 0x80000000
};

const DEFAULT_NEGOTIATE_FLAGS = (
  NTLMFlags.NTLM_NegotiateUnicode |
  NTLMFlags.NTLM_NegotiateOEM |
  NTLMFlags.NTLM_RequestTarget |
  NTLMFlags.NTLM_NegotiateNTLM |
  NTLMFlags.NTLM_NegotiateAlwaysSign |
  NTLMFlags.NTLM_NegotiateExtendedSecurity |
  NTLMFlags.NTLM_Negotiate128 |
  NTLMFlags.NTLM_Negotiate56
) >>> 0;

class NTLMAuthProvider {
  constructor(connection, options) {
    this.connection = connection;
    this.options = options;
  }

  handshake(data, callback) {
    if (!data) {
      process.nextTick(callback, null, this.buildNegotiateMessage());
    } else {
      process.nextTick(callback, null, this.buildAuthenticateMessage(this.parseChallengeMessage(data)));
    }
  }

  buildNegotiateMessage() {
    const messageBuffer = Buffer.alloc(40);
    const domainBuffer = Buffer.from(this.options.domain || '', 'ascii');
    const workstationBuffer = Buffer.from(this.options.workstation || '', 'ascii');

    let negotiateFlags = DEFAULT_NEGOTIATE_FLAGS;

    if (domainBuffer.length) {
      negotiateFlags = (negotiateFlags | NTLMFlags.NTLM_NegotiateOemDomainSupplied) >>> 0;
    }

    if (workstationBuffer.length) {
      negotiateFlags = (negotiateFlags | NTLMFlags.NTLM_NegotiateOemWorkstationSupplied) >>> 0;
    }

    messageBuffer.write('NTLMSSP');
    messageBuffer.writeUInt32LE(1, 8);
    messageBuffer.writeUInt32LE(negotiateFlags, 12);

    messageBuffer.writeUInt16LE(domainBuffer.length, 16);
    messageBuffer.writeUInt16LE(domainBuffer.length, 18);
    messageBuffer.writeUInt32LE(messageBuffer.length + workstationBuffer.length, 20);

    messageBuffer.writeUInt16LE(workstationBuffer.length, 24);
    messageBuffer.writeUInt16LE(workstationBuffer.length, 26);
    messageBuffer.writeUInt32LE(messageBuffer.length, 28);

    // ProductMajorVersion
    messageBuffer.writeUInt8(0, 32);

    // ProductMinorVersion
    messageBuffer.writeUInt8(0, 33);

    // ProductBuild
    messageBuffer.writeUInt16LE(0, 34);

    // Reserved
    messageBuffer.writeUInt8(0, 36);
    messageBuffer.writeUInt8(0, 37);
    messageBuffer.writeUInt8(0, 38);

    // NTLMRevisionCurrent
    messageBuffer.writeUInt8(15, 39);

    return Buffer.concat([messageBuffer, workstationBuffer, domainBuffer]);
  }

  parseChallengeMessage(buffer) {
    const challenge = {};

    challenge.magic = buffer.slice(0, 8).toString('utf8');
    challenge.type = buffer.readInt32LE(8);
    challenge.domainLen = buffer.readInt16LE(12);
    challenge.domainMax = buffer.readInt16LE(14);
    challenge.domainOffset = buffer.readInt32LE(16);
    challenge.flags = buffer.readUInt32LE(20);
    challenge.nonce = buffer.slice(24, 32);
    challenge.zeroes = buffer.slice(32, 40);
    challenge.targetLen = buffer.readInt16LE(40);
    challenge.targetMax = buffer.readInt16LE(42);
    challenge.targetOffset = buffer.readInt32LE(44);
    challenge.oddData = buffer.slice(48, 56);
    challenge.domain = buffer.slice(56, 56 + challenge.domainLen).toString('ucs2');
    challenge.target = buffer.slice(56 + challenge.domainLen, 56 + challenge.domainLen + challenge.targetLen);

    return challenge;
  }

  buildAuthenticateMessage(challenge) {
    const clientNonceBuffer = crypto.randomBytes(8);
    const domainBuffer = Buffer.from(this.options.domain || '', 'ucs2');
    const usernameBuffer = Buffer.from(this.options.username || '', 'ucs2');
    const workstationBuffer = Buffer.from(this.options.workstation || '', 'ucs2');

    const targetName = challenge.target;
    const serverNonceBuffer = challenge.nonce;

    let lmChallengeResponseBuffer, ntChallengeResponseBuffer;
    if (this.options.username && this.options.password) {
      const responseKey = this.generateResponseKey(this.options.domain, this.options.username, this.options.password);
      lmChallengeResponseBuffer = this.buildLMv2Response(responseKey, serverNonceBuffer, clientNonceBuffer);

      const timestampBuffer = this.createTimestamp(new Date().getTime());
      ntChallengeResponseBuffer = this.buildNTLMv2Response(responseKey, targetName, timestampBuffer, serverNonceBuffer, clientNonceBuffer);
    } else {
      lmChallengeResponseBuffer = Buffer.alloc(0);
      ntChallengeResponseBuffer = Buffer.alloc(0);
    }

    const messageBuffer = Buffer.alloc(64);

    let payloadOffset = messageBuffer.length;

    messageBuffer.write('NTLMSSP');
    messageBuffer.writeUInt32LE(0x03, 8);

    messageBuffer.writeUInt16LE(lmChallengeResponseBuffer.length, 12);
    messageBuffer.writeUInt16LE(lmChallengeResponseBuffer.length, 14);
    messageBuffer.writeUInt32LE(payloadOffset, 16);

    payloadOffset += lmChallengeResponseBuffer.length;

    messageBuffer.writeUInt16LE(ntChallengeResponseBuffer.length, 20);
    messageBuffer.writeUInt16LE(ntChallengeResponseBuffer.length, 22);
    messageBuffer.writeUInt32LE(payloadOffset, 24);

    payloadOffset += ntChallengeResponseBuffer.length;

    messageBuffer.writeUInt16LE(domainBuffer.length, 28);
    messageBuffer.writeUInt16LE(domainBuffer.length, 30);
    messageBuffer.writeUInt32LE(payloadOffset, 32);

    payloadOffset += domainBuffer.length;

    messageBuffer.writeUInt16LE(usernameBuffer.length, 36);
    messageBuffer.writeUInt16LE(usernameBuffer.length, 38);
    messageBuffer.writeUInt32LE(payloadOffset, 40);

    payloadOffset += usernameBuffer.length;

    messageBuffer.writeUInt16LE(workstationBuffer.length, 44);
    messageBuffer.writeUInt16LE(workstationBuffer.length, 46);
    messageBuffer.writeUInt32LE(payloadOffset, 48);

    messageBuffer.writeUInt32LE(challenge.flags, 60);

    return Buffer.concat([
      messageBuffer,
      lmChallengeResponseBuffer,
      ntChallengeResponseBuffer,
      domainBuffer,
      usernameBuffer,
      workstationBuffer
    ]);
  }

  createTimestamp(time) {
    const tenthsOfAMicrosecond = new BigInteger(time).plus(11644473600).multiply(10000000);
    const hexArray = [];

    let pair = [];
    while (tenthsOfAMicrosecond.val() !== '0') {
      const idx = tenthsOfAMicrosecond.mod(16);
      pair.unshift(hex[idx]);
      if (pair.length === 2) {
        hexArray.push(pair.join(''));
        pair = [];
      }
    }

    if (pair.length > 0) {
      hexArray.push(pair[0] + '0');
    }

    return new Buffer(hexArray.join(''), 'hex');
  }

  buildLMv2Response(responseKey, serverNonceBuffer, clientNonceBuffer) {
    const hmacMd5 = crypto.createHmac('MD5', responseKey);

    return Buffer.concat([
      hmacMd5.update(serverNonceBuffer).update(clientNonceBuffer).digest(),
      clientNonceBuffer
    ]);
  }

  buildNTLMv2Response(responseKey, targetInfo, timestampBuffer, serverNonceBuffer, clientNonceBuffer) {
    const blob = Buffer.concat([
      Buffer.from('01', 'hex'),
      Buffer.from('01', 'hex'),
      Buffer.alloc(6),
      timestampBuffer,
      clientNonceBuffer,
      Buffer.alloc(4),
      targetInfo,
      Buffer.alloc(4)
    ]);

    const hmacMd5 = crypto.createHmac('MD5', responseKey);

    return Buffer.concat([
      hmacMd5.update(serverNonceBuffer).update(blob).digest(),
      blob
    ]);
  }

  generateResponseKey(domain, username, password) {
    const hashedPassword = crypto.createHash('md4').update(Buffer.from(password, 'ucs2')).digest();

    const hmacMd5 = crypto.createHmac('MD5', hashedPassword);
    hmacMd5.update(Buffer.from(username.toUpperCase(), 'ucs2'));
    if (domain) {
      hmacMd5.update(Buffer.from(domain, 'ucs2'));
    }
    return hmacMd5.digest();
  }
}

module.exports = function(options) {
  return function(connection) {
    return new NTLMAuthProvider(connection, options);
  };
};

module.exports.NTLMAuthProvider = NTLMAuthProvider;
