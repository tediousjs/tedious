var
  jspack = require('./jspack').jspack;
  
const STATUS_NORMAL = 0x00;
const STATUS_EOM = 0x01;                      // End Of Message (last packet).
const STATUS_IGNORE = 0x02;                   // EOM must also be set.
const STATUS_RESETCONNECTION = 0x08;
const STATUS_RESETCONNECTIONSKIPTRAN = 0x10;

const HEADER_FORMAT = 'BBHHBB';
const HEADER_LENGTH = 8;

exports.type = {
  PRELOGIN: 0x12,
  LOGIN7: 0x10
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
    
    var length = HEADER_LENGTH + data.length
    var spid = 0;
    var packetId = 0;   // Spec says that this is currently ignored.
    var window = 0;     // Spec says that this is currently ignored.
    
    return jspack.Pack(HEADER_FORMAT, [type, status, length, spid, packetId, window]);
  }
  
  function write(stream) {
    stream.write(new Buffer(content()));
  }
};

exports.decode = function(packetContent, callback) {
  callback(decodeHeader(), extractData());
  
  function decodeHeader() {
    var header = jspack.Unpack(HEADER_FORMAT, packetContent, 0);
    
    return {
      type: header[0],
      status: header[1],
      length: header[2],
      spid: header[3],
      packetId: header[4],
      window: header[5]
    };
  }
  
  function extractData() {
    return packetContent.slice(HEADER_LENGTH);
  }
};
