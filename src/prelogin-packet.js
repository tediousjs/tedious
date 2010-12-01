var
  Packet = require('./packet').Packet,
  type = require('./packet').type,
  jspack = require('./jspack').jspack;

exports.PreloginPacket = function() {
  var stagedOptions = [];
  
  addVersionOption();
  addEncyptionOption();
  addInstanceOption();
  addThreadIdOption();
  addMarsOption();
  
  return new Packet(type.PRELOGIN, buildData());
  
  function addOption(token, optionData) {
    stagedOptions.push({
      token: token,
      data: optionData
    });
  }
  
  function buildData() {
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
  
  function addVersionOption() {
    var version = 0x000000001,
        subbuild = 0x0001;
    
    addOption(0x00, jspack.Pack('LH', [version, subbuild]));
  }
  
  function addEncyptionOption() {
    var encryption = 0x02;    // Encryption not supported (yet).
    
    addOption(0x01, jspack.Pack('B', [encryption]));
  }
  
  function addInstanceOption() {
    addOption(0x02, jspack.Pack('B', 0x00));
  }
  
  function addThreadIdOption() {
    addOption(0x03, jspack.Pack('L', 0));
  }
  
  function addMarsOption() {
    var mars = 0x00;        // Mars off.
    
    addOption(0x04, jspack.Pack('B', mars));
  }
};
