var
  jspack = require('./jspack').jspack;
  
const HEADER_FORMAT = 'BBHHBB';
const HEADER_LENGTH = 8;

const STATUS = {
  NORMAL: 0x00,
  EOM: 0x01,                      // End Of Message (last packet).
  IGNORE: 0x02,                   // EOM must also be set.
  RESETCONNECTION: 0x08,
  RESETCONNECTIONSKIPTRAN: 0x10
};

exports.status = STATUS;

exports.type = {
  PRELOGIN: 0x12,
  LOGIN7: 0x10
};

exports.build = function(type, data, headerFields) {
  data = data || [];
  defaultheaderFields(headerFields);
  
  return header().concat(data);

  function defaultheaderFields() {
    if (!headerFields) {
      headerFields = {};
    }

    if (headerFields.status === undefined) {
      headerFields.status = STATUS.NORMAL;
    }

    if (headerFields.last) {
      headerFields.status |= STATUS.EOM;
    }

    if (headerFields.status & STATUS.IGNORE) {
      headerFields.status |= STATUS.EOM;
    }
    
    headerFields.spid = headerFields.spid || 0;
    headerFields.packet = headerFields.packetId || 0; 
    headerFields.window = headerFields.window || 0; 
  }

  function header() {
    var length = HEADER_LENGTH + data.length
    
    return jspack.Pack(HEADER_FORMAT, [type, headerFields.status, length, headerFields.spid, headerFields.packetId, headerFields.window]);
  }
};

exports.decode = function(packetContent) {
  return {
    header: decodeHeader(),
    data: extractData()
  };
  
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

exports.toString = function(packetContent) {
  var packet = exports.decode(packetContent);
  
  return packet;
}
