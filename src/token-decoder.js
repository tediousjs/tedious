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
    case 0xAB:
      this.emit('info', this.createInfo());
      break;
    case 0xAD:
      this.emit('loginAck', this.createLoginAck());
      break;
    case 0xE3:
      this.emit('envChange', this.createEnvChange());
      break;
    default:
      this.emit('unknown', 'tokenType: ' + tokenType);
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

TokenDecoder.prototype.createEnvChange = function() {
  var offset = this.offset,
      unpacked,
      type,
      length,
      envChange = {};
  
  unpacked = jspack.Unpack('<HB', this.data, offset);
  length = unpacked[0];
  offset += 3;

  type = unpacked[1];
  switch (type) {
  case 1:
    envChange.type = 'database';
    envChange.newValue = this.bVarchar(offset);
    offset += 1 + (2 * envChange.newValue.length)
    envChange.oldValue = this.bVarchar(offset);
    break;
  case 2:
    envChange.type = 'language';
    envChange.newValue = this.bVarchar(offset);
    offset += 1 + (2 * envChange.newValue.length)
    envChange.oldValue = this.bVarchar(offset);
    break;
  case 4:
    envChange.type = 'packetSize';
    envChange.newValue = this.bVarchar(offset);
    offset += 1 + (2 * envChange.newValue.length)
    envChange.oldValue = this.bVarchar(offset);
    break;
  case 7:
    envChange.type = 'sqlCollation';
    envChange.newValue = this.bVarbyte(offset);
    offset += 1 + envChange.newValue.length
    envChange.oldValue = this.bVarbyte(offset);
    break;
  default:
    this.emit('unknown', 'ENVCHANGE type: ' + type);
  }
  
  this.offset += 2 + length;
  
  return envChange;
}

TokenDecoder.prototype.createInfo = function() {
  var offset = this.offset,
      unpacked,
      length,
      info = {};
  
  unpacked = jspack.Unpack('<H<lBB', this.data, offset);
  length = unpacked[0];
  info.number = unpacked[1];
  info.state = unpacked[2];
  info.class = unpacked[3];
  offset += 8;

  info.messageText = this.usVarchar(offset);
  offset += 2 + (2 * info.messageText.length);

  info.serverName = this.bVarchar(offset);
  offset += 1 + (2 * info.serverName.length);

  info.procName = this.bVarchar(offset);
  offset += 1 + (2 * info.procName.length);

  unpacked = jspack.Unpack('<l', this.data, offset);
  info.lineNumber = unpacked[0];

  this.offset += 2 + length;
  
  return info;
}

TokenDecoder.prototype.bVarbyte = function(offset) {
  var length = this.data[offset];
  
  return this.data.slice(offset + 1, offset + 1 + length);
}

TokenDecoder.prototype.bVarchar = function(offset) {
  var length = 2 * this.data[offset];
  
  return unicodeToText(this.data, length, offset + 1);
}

TokenDecoder.prototype.usVarchar = function(offset) {
  var length = 2 * jspack.Unpack('<H', this.data, offset)[0];
  
  return unicodeToText(this.data, length, offset + 2);
}

exports.TokenDecoder = TokenDecoder;
