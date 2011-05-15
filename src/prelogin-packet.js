var Packet = require('./packet').Packet,
    TYPE = require('./packet').TYPE,
    jspack = require('./jspack').jspack,
    sprintf = require('sprintf').sprintf,
    util = require('util'),
    
    TOKEN = {
      VERSION: 0x00,
      ENCRYPTION: 0x01,
      INSTOPT: 0x02,
      THREADID: 0x03,
      MARS: 0x04,
      TERMINATOR: 0xFF
    },
    
    ENCRYPT = {
      OFF: 0x00,
      ON: 0x01,
      NOT_SUP: 0x02,
      REQ: 0x03
    };

var PreLoginPacket = function(headerFields) {
  var options = createOptions(),
      data = buildData(options);
  
  Packet.call(this, TYPE.PRELOGIN, data, headerFields);
};

util.inherits(PreLoginPacket, Packet);

PreLoginPacket.prototype.decodeOptionTokens = function() {
  var optionTokens = {},
      data = this.decode().data,
      offset = 0,
      tokenArray,
      token,
      versionArray;
  
  while (data[offset] !== TOKEN.TERMINATOR) {
    tokenArray = jspack.Unpack('BHH', data, offset);
    token = {
      type: tokenArray[0],
      offset: tokenArray[1],
      length: tokenArray[2]
    };

    if (token.length > 0) {
      switch (token.type) {
      case TOKEN.VERSION:
        versionArray = jspack.Unpack('BBHH', data, token.offset);
        optionTokens.version = {};
        optionTokens.version.major = versionArray[0];
        optionTokens.version.minor = versionArray[1];
        optionTokens.version.patch = versionArray[2];
        optionTokens.version.subbuild = versionArray[3];
        break;
      case TOKEN.ENCRYPTION:
        optionTokens.encryption = jspack.Unpack('B', data, token.offset)[0];
        break;
      case TOKEN.INSTOPT:
        optionTokens.instopt = jspack.Unpack('B', data, token.offset)[0];
        break;
      case TOKEN.THREADID:
        optionTokens.threadId = jspack.Unpack('L', data, token.offset)[0];
        break;
      case TOKEN.MARS:
        optionTokens.mars = jspack.Unpack('B', data, token.offset)[0];
        break;
      }
    }
    
    offset += 5;
  }
  
  return optionTokens;
};

PreLoginPacket.prototype.dataAsString = function(indent) {
  var optionTokens = this.decodeOptionTokens();

  return indent + 'PreLogin - ' +
      sprintf('version:%d.%d.%d.%d, encryption:0x%02X, instopt:0x%02X, threadId:0x%08X, mars:0x%02X',
          optionTokens.version.major,
          optionTokens.version.minor,
          optionTokens.version.patch,
          optionTokens.version.subbuild,
          optionTokens.encryption,
          optionTokens.instopt,
          optionTokens.threadId,
          optionTokens.mars
          );
};

function buildData(stagedOptions) {
  var options = [],
      optionDatas = [],
      offset =
              (stagedOptions.length * 5) +  // options
              1;                            // terminator token

  stagedOptions.forEach(function (option) {
    options = options.concat(jspack.Pack('BHH', [option.token, offset, option.data.length]));
    optionDatas = optionDatas.concat(option.data);
    
    offset += option.data.length;
  });
  
  options.push(0xff); // Terminator token;
  
  return options.concat(optionDatas);
}

function createOptions() {
  var options = [],
      version = 0x000000001,
      subbuild = 0x0001,
      encryption = ENCRYPT.NOT_SUP,   // Encryption not supported (yet).
      mars = 0x00;                    // Mars off.

  options.push(option(TOKEN.VERSION, jspack.Pack('LH', [version, subbuild])));
  options.push(option(TOKEN.ENCRYPTION, jspack.Pack('B', [encryption])));
  options.push(option(TOKEN.INSTOPT, jspack.Pack('B', [0x00])));
  options.push(option(TOKEN.THREADID, jspack.Pack('L', [0x00])));
  options.push(option(TOKEN.MARS, jspack.Pack('B', [mars])));
  
  return options;
}

function option(token, optionData) {
  return {
    token: token,
    data: optionData
  };
}

exports.PreLoginPacket = PreLoginPacket;
exports.ENCRYPT = ENCRYPT;
