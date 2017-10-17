const WritableTrackingBuffer = require('../tracking-buffer/writable-tracking-buffer');
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

class NTLMResponsePayload {
  constructor(loginData) {
    this.data = this.createResponse(loginData);
  }

  toString(indent) {
    indent || (indent = '');
    return indent + 'NTLM Auth';
  }

  createResponse(challenge) {
    const client_nonce = this.createClientNonce();
    const lmv2len = 24;
    const ntlmv2len = 16;
    const domain = challenge.domain;
    const username = challenge.username;
    const password = challenge.password;
    let ntlmData = challenge.ntlmpacket;
    const server_data = ntlmData.target;
    const server_nonce = ntlmData.nonce;
    const bufferLength = 64 + (domain.length * 2) + (username.length * 2) + lmv2len + ntlmv2len + 8 + 8 + 8 + 4 + server_data.length + 4;
    const data = new WritableTrackingBuffer(bufferLength);
    data.position = 0;
    data.writeString('NTLMSSP\u0000', 'utf8');
    data.writeUInt32LE(0x03);
    const baseIdx = 64;
    const dnIdx = baseIdx;
    const unIdx = dnIdx + domain.length * 2;
    const l2Idx = unIdx + username.length * 2;
    const ntIdx = l2Idx + lmv2len;
    data.writeUInt16LE(lmv2len);
    data.writeUInt16LE(lmv2len);
    data.writeUInt32LE(l2Idx);
    data.writeUInt16LE(ntlmv2len);
    data.writeUInt16LE(ntlmv2len);
    data.writeUInt32LE(ntIdx);
    data.writeUInt16LE(domain.length * 2);
    data.writeUInt16LE(domain.length * 2);
    data.writeUInt32LE(dnIdx);
    data.writeUInt16LE(username.length * 2);
    data.writeUInt16LE(username.length * 2);
    data.writeUInt32LE(unIdx);
    data.writeUInt16LE(0);
    data.writeUInt16LE(0);
    data.writeUInt32LE(baseIdx);
    data.writeUInt16LE(0);
    data.writeUInt16LE(0);
    data.writeUInt32LE(baseIdx);
    data.writeUInt16LE(0x8201);
    data.writeUInt16LE(0x08);
    data.writeString(domain, 'ucs2');
    data.writeString(username, 'ucs2');
    const lmv2Data = this.lmv2Response(domain, username, password, server_nonce, client_nonce);
    data.copyFrom(lmv2Data);
    const genTime = new Date().getTime();
    ntlmData = this.ntlmv2Response(domain, username, password, server_nonce, server_data, client_nonce, genTime);
    data.copyFrom(ntlmData);
    data.writeUInt32LE(0x0101);
    data.writeUInt32LE(0x0000);
    const timestamp = this.createTimestamp(genTime);
    data.copyFrom(timestamp);
    data.copyFrom(client_nonce);
    data.writeUInt32LE(0x0000);
    data.copyFrom(server_data);
    data.writeUInt32LE(0x0000);
    return data.data;
  }

  createClientNonce() {
    const client_nonce = new Buffer(8);
    let nidx = 0;
    while (nidx < 8) {
      client_nonce.writeUInt8(Math.ceil(Math.random() * 255), nidx);
      nidx++;
    }
    return client_nonce;
  }

  ntlmv2Response(domain, user, password, serverNonce, targetInfo, clientNonce, mytime) {
    const timestamp = this.createTimestamp(mytime);
    const hash = this.ntv2Hash(domain, user, password);
    const dataLength = 40 + targetInfo.length;
    const data = new Buffer(dataLength);
    serverNonce.copy(data, 0, 0, 8);
    data.writeUInt32LE(0x101, 8);
    data.writeUInt32LE(0x0, 12);
    timestamp.copy(data, 16, 0, 8);
    clientNonce.copy(data, 24, 0, 8);
    data.writeUInt32LE(0x0, 32);
    targetInfo.copy(data, 36, 0, targetInfo.length);
    data.writeUInt32LE(0x0, 36 + targetInfo.length);
    return this.hmacMD5(data, hash);
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

  lmv2Response(domain, user, password, serverNonce, clientNonce) {
    const hash = this.ntv2Hash(domain, user, password);
    const data = new Buffer(serverNonce.length + clientNonce.length);

    serverNonce.copy(data);
    clientNonce.copy(data, serverNonce.length, 0, clientNonce.length);

    const newhash = this.hmacMD5(data, hash);
    const response = new Buffer(newhash.length + clientNonce.length);

    newhash.copy(response);
    clientNonce.copy(response, newhash.length, 0, clientNonce.length);

    return response;
  }

  ntv2Hash(domain, user, password) {
    const hash = this.ntHash(password);
    const identity = new Buffer(user.toUpperCase() + domain.toUpperCase(), 'ucs2');
    return this.hmacMD5(identity, hash);
  }

  ntHash(text) {
    const hash = new Buffer(21);
    hash.fill(0);

    const unicodeString = new Buffer(text, 'ucs2');
    const md4 = crypto.createHash('md4').update(unicodeString).digest();
    if (md4.copy) {
      md4.copy(hash);
    } else {
      new Buffer(md4, 'ascii').copy(hash);
    }
    return hash;
  }

  hmacMD5(data, key) {
    const hmac = crypto.createHmac('MD5', key);
    hmac.update(data);

    const result = hmac.digest();
    if (result.copy) {
      return result;
    } else {
      return new Buffer(result, 'ascii').slice(0, 16);
    }
  }
}

const DEFAULT_NEGOTIATE_FLAGS =
  NTLMFlags.NTLM_NegotiateUnicode +
  NTLMFlags.NTLM_NegotiateOEM +
  NTLMFlags.NTLM_RequestTarget +
  NTLMFlags.NTLM_NegotiateNTLM +
  NTLMFlags.NTLM_NegotiateAlwaysSign +
  NTLMFlags.NTLM_NegotiateVersion +
  NTLMFlags.NTLM_NegotiateExtendedSecurity +
  NTLMFlags.NTLM_Negotiate128 +
  NTLMFlags.NTLM_Negotiate56;

module.exports = class NTLMAuthProvider {
  constructor(connection) {
    this.connection = connection;
  }

  handshake(data, callback) {
    if (!data) {
      return callback(null, this.buildNegotiateMessage());
    }

    const payload = new NTLMResponsePayload({
      domain: this.connection.config.domain,
      username: this.connection.config.userName,
      password: this.connection.config.password,
      ntlmpacket: this.parseChallengeMessage(data)
    });

    callback(null, payload.data);
  }

  buildNegotiateMessage() {
    const protocol = 'NTLMSSP\u0000';
    const BODY_LENGTH = 40;

    const domainBuffer = Buffer.from(this.connection.config.domain || '', 'ascii');
    const workstationBuffer = Buffer.from(this.connection.config.workstation || '', 'ascii');

    const buffer = new WritableTrackingBuffer(BODY_LENGTH + domainBuffer.length + workstationBuffer.length);

    let negotiateFlags = DEFAULT_NEGOTIATE_FLAGS;

    if (domainBuffer.length) {
      negotiateFlags += NTLMFlags.NTLM_NegotiateOemDomainSupplied;
    }

    if (workstationBuffer.length) {
      negotiateFlags += NTLMFlags.NTLM_NegotiateOemWorkstationSupplied;
    }

    buffer.writeString(protocol, 'utf8');
    buffer.writeUInt32LE(1);
    buffer.writeUInt32LE(negotiateFlags);
    buffer.writeUInt16LE(domainBuffer.length);
    buffer.writeUInt16LE(domainBuffer.length);
    buffer.writeUInt32LE(BODY_LENGTH + workstationBuffer.length);
    buffer.writeUInt16LE(workstationBuffer.length);
    buffer.writeUInt16LE(workstationBuffer.length);
    buffer.writeUInt32LE(BODY_LENGTH);
    buffer.writeUInt8(5);
    buffer.writeUInt8(0);
    buffer.writeUInt16LE(2195);
    buffer.writeUInt8(0);
    buffer.writeUInt8(0);
    buffer.writeUInt8(0);
    buffer.writeUInt8(15);
    buffer.writeBuffer(workstationBuffer);
    buffer.writeBuffer(domainBuffer);

    return buffer.data;
  }

  parseChallengeMessage(buffer) {
    const challenge = {};

    challenge.magic = buffer.slice(0, 8).toString('utf8');
    challenge.type = buffer.readInt32LE(8);
    challenge.domainLen = buffer.readInt16LE(12);
    challenge.domainMax = buffer.readInt16LE(14);
    challenge.domainOffset = buffer.readInt32LE(16);
    challenge.flags = buffer.readInt32LE(20);
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
};
