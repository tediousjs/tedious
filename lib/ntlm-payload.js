'use strict';

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var WritableTrackingBuffer = require('./tracking-buffer/writable-tracking-buffer');
var crypto = require('crypto');
var BigInteger = require('big-number').n;

var hex = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];

module.exports = function () {
  function NTLMResponsePayload(loginData) {
    (0, _classCallCheck3.default)(this, NTLMResponsePayload);

    this.data = this.createResponse(loginData);
  }

  (0, _createClass3.default)(NTLMResponsePayload, [{
    key: 'toString',
    value: function toString(indent) {
      indent || (indent = '');
      return indent + 'NTLM Auth';
    }
  }, {
    key: 'createResponse',
    value: function createResponse(challenge) {
      var client_nonce = this.createClientNonce();
      var lmv2len = 24;
      var ntlmv2len = 16;
      var domain = challenge.domain;
      var username = challenge.userName;
      var password = challenge.password;
      var ntlmData = challenge.ntlmpacket;
      var server_data = ntlmData.target;
      var server_nonce = ntlmData.nonce;
      var bufferLength = 64 + domain.length * 2 + username.length * 2 + lmv2len + ntlmv2len + 8 + 8 + 8 + 4 + server_data.length + 4;
      var data = new WritableTrackingBuffer(bufferLength);
      data.position = 0;
      data.writeString('NTLMSSP\0', 'utf8');
      data.writeUInt32LE(0x03);
      var baseIdx = 64;
      var dnIdx = baseIdx;
      var unIdx = dnIdx + domain.length * 2;
      var l2Idx = unIdx + username.length * 2;
      var ntIdx = l2Idx + lmv2len;
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
      var lmv2Data = this.lmv2Response(domain, username, password, server_nonce, client_nonce);
      data.copyFrom(lmv2Data);
      var genTime = new Date().getTime();
      ntlmData = this.ntlmv2Response(domain, username, password, server_nonce, server_data, client_nonce, genTime);
      data.copyFrom(ntlmData);
      data.writeUInt32LE(0x0101);
      data.writeUInt32LE(0x0000);
      var timestamp = this.createTimestamp(genTime);
      data.copyFrom(timestamp);
      data.copyFrom(client_nonce);
      data.writeUInt32LE(0x0000);
      data.copyFrom(server_data);
      data.writeUInt32LE(0x0000);
      return data.data;
    }
  }, {
    key: 'createClientNonce',
    value: function createClientNonce() {
      var client_nonce = new Buffer(8);
      var nidx = 0;
      while (nidx < 8) {
        client_nonce.writeUInt8(Math.ceil(Math.random() * 255), nidx);
        nidx++;
      }
      return client_nonce;
    }
  }, {
    key: 'ntlmv2Response',
    value: function ntlmv2Response(domain, user, password, serverNonce, targetInfo, clientNonce, mytime) {
      var timestamp = this.createTimestamp(mytime);
      var hash = this.ntv2Hash(domain, user, password);
      var dataLength = 40 + targetInfo.length;
      var data = new Buffer(dataLength);
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
  }, {
    key: 'createTimestamp',
    value: function createTimestamp(time) {
      var tenthsOfAMicrosecond = new BigInteger(time).plus(11644473600).multiply(10000000);
      var hexArray = [];

      var pair = [];
      while (tenthsOfAMicrosecond.val() !== '0') {
        var idx = tenthsOfAMicrosecond.mod(16);
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
  }, {
    key: 'lmv2Response',
    value: function lmv2Response(domain, user, password, serverNonce, clientNonce) {
      var hash = this.ntv2Hash(domain, user, password);
      var data = new Buffer(serverNonce.length + clientNonce.length);

      serverNonce.copy(data);
      clientNonce.copy(data, serverNonce.length, 0, clientNonce.length);

      var newhash = this.hmacMD5(data, hash);
      var response = new Buffer(newhash.length + clientNonce.length);

      newhash.copy(response);
      clientNonce.copy(response, newhash.length, 0, clientNonce.length);

      return response;
    }
  }, {
    key: 'ntv2Hash',
    value: function ntv2Hash(domain, user, password) {
      var hash = this.ntHash(password);
      var identity = new Buffer(user.toUpperCase() + domain.toUpperCase(), 'ucs2');
      return this.hmacMD5(identity, hash);
    }
  }, {
    key: 'ntHash',
    value: function ntHash(text) {
      var hash = new Buffer(21);
      hash.fill(0);

      var unicodeString = new Buffer(text, 'ucs2');
      var md4 = crypto.createHash('md4').update(unicodeString).digest();
      if (md4.copy) {
        md4.copy(hash);
      } else {
        new Buffer(md4, 'ascii').copy(hash);
      }
      return hash;
    }
  }, {
    key: 'hmacMD5',
    value: function hmacMD5(data, key) {
      var hmac = crypto.createHmac('MD5', key);
      hmac.update(data);

      var result = hmac.digest();
      if (result.copy) {
        return result;
      } else {
        return new Buffer(result, 'ascii').slice(0, 16);
      }
    }
  }]);
  return NTLMResponsePayload;
}();