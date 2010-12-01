var
  jspack = require('./jspack').jspack;
  
const STATUS_NORMAL = 0x00;
const STATUS_EOM = 0x01;                      // End Of Message (last packet).
const STATUS_IGNORE = 0x02;                   // EOM must also be set.
const STATUS_RESETCONNECTION = 0x08;
const STATUS_RESETCONNECTIONSKIPTRAN = 0x10;

exports.type = {
  PRELOGIN: 18,
  LOGIN7: 16
};

exports.build = function(type, data, options) {
  data = data || [];
  
  if (!options) {
    options = {};
  }
  if (options.last === undefined) {
    options.last = true;
  }
  
  return {
    content: content,
    write: write
  }

  function content() {
    return header().concat(data);
  }
  
  function header() {
    var status = STATUS_NORMAL;
    if (options.last) {
      status |= STATUS_EOM;
    }
    
    var length = 8 + data.length
    var spid = 0;
    var packetId = 0;   // Spec says that this is currently ignored.
    var window = 0;     // Spec says that this is currently ignored.
    
    return jspack.Pack('BBHHBB', [type, status, length, spid, packetId, window]);
  }
  
  function write(stream) {
    stream.write(new Buffer(content()));
  }
};
