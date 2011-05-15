var jspack = require('./jspack').jspack,
    EventEmitter = require("events").EventEmitter,
    inherits = require('util').inherits,
    unicodeToText = require('../src/unicode').unicodeToText;

var TokenDecoder = function() {
  EventEmitter.call(this);
}

inherits(TokenDecoder, EventEmitter);

TokenDecoder.prototype.decode = function(data) {
  var tokenType;

  this.data = data;
  this.offset = 0;

  while (this.offset < data.length) {
    tokenType = data[this.offset];
    this.offset++;

    switch (tokenType) {
    case 0xAD:
      this.emit('loginAck', this.createLoginAck());
      break;
    default:
      this.emit('unknown', tokenType);
      this.emit('done');
      return;
    }
  }

  this.emit('done');
}

TokenDecoder.prototype.createLoginAck = function() {
  var offset = this.offset,
      unpacked,
      length,
      varcharLength,
      loginAck = {};
  
  unpacked = jspack.Unpack('<HB<l', this.data, offset);
  length = unpacked[0];
  loginAck.interfaceType = unpacked[1];
  loginAck.tdsVersion = unpacked[2];
  offset += 7;
 
  loginAck.progName = this.bVarchar(offset);
  offset += 1 + (2 * loginAck.progName.length);

  loginAck.progVersion = {};
  loginAck.progVersion.major = this.data[offset + 0];
  loginAck.progVersion.minor = this.data[offset + 1];
  loginAck.progVersion.buildNumberHigh = this.data[offset + 2];
  loginAck.progVersion.buildNumberLow = this.data[offset + 3];

  this.offset += 2 + length;
  
  return loginAck;
}

TokenDecoder.prototype.bVarchar = function(offset) {
  var length = 2 * this.data[offset];
  
  return unicodeToText(this.data, length, offset + 1);
}

exports.TokenDecoder = TokenDecoder;
