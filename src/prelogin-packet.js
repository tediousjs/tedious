var Packet = require('./packet').Packet,
    TYPE = require('./packet').TYPE,
    jspack = require('./jspack').jspack,
    
    TOKEN = {
      VERSION: 0x00,
      ENCRYPTION: 0x01,
      INSTOPT: 0x02,
      THREADID: 0x03,
      MARS: 0x04,
      TERMINATOR: 0xFF
    };

var PreLoginPacket = function(headerFields) {
  var options = createOptions(),
      data = buildData(options);
  
  return new Packet(TYPE.PRELOGIN, data, headerFields);
};

module.exports = PreLoginPacket;

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
      encryption = 0x02,    // Encryption not supported (yet).
      mars = 0x00;          // Mars off.

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
