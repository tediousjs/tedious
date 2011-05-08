var jspack = require('./jspack').jspack,
    events = require('events'),
    sprintf = require('sprintf').sprintf,
    util = require('util');

var HEADER_FORMAT = 'BBHHBB',
    HEADER_LENGTH = 8,
    NL = '\n',
    
    STATUS = {
      NORMAL: 0x00,
      EOM: 0x01,                      // End Of Message (last packet).
      IGNORE: 0x02,                   // EOM must also be set.
      RESETCONNECTION: 0x08,
      RESETCONNECTIONSKIPTRAN: 0x10
    },
    
    TYPE = {
      PRELOGIN: 0x12,
      LOGIN7: 0x10
    },
    
    statusAsText = {},
    typesAsText = {};

for (var status in STATUS) {
  statusAsText[STATUS[status]] = status;
}

for (var type in TYPE) {
  typesAsText[TYPE[type]] = type;
}

var Packet = function (type, data, headerFields) {
  var self = this,
      header,
      packet;
  
  if (typeof type === 'number') {
    events.EventEmitter.call(self);
    
    data = data || [];
  
    headerFields = headerFields || {};
    defaultheaderFields(headerFields);
    
    header = buildHeader(type, data, headerFields);
    packet = header.concat(data);
  
    self.buffer = new Buffer(packet);
  } else {
    self.buffer = type;
  }
};

util.inherits(Packet, events.EventEmitter);

Packet.prototype.decode = function() {
  return {
    header: decodeHeader(this.buffer),
    data: extractData(this.buffer)
  };
};

Packet.prototype.toString = function() {
  var decoded = this.decode();
  
  return headerToString(decoded) + NL + dataDump(decoded);
}

function isPacketComplete(potentialPacket) {
  if (potentialPacket.length < HEADER_LENGTH) {
    return false;
  } else {
    return potentialPacket.length >= decodeHeader(potentialPacket).length;
  }
}

function decodeHeader(packetContent) {
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

function extractData(packetContent) {
  return packetContent.slice(HEADER_LENGTH);
}

function defaultheaderFields(headerFields) {
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

function buildHeader(type, data, headerFields) {
  var length = HEADER_LENGTH + data.length
  
  return jspack.Pack(HEADER_FORMAT, [type, headerFields.status, length, headerFields.spid, headerFields.packetId, headerFields.window]);
}

function headerToString(packet) {
  var statusText = '',
      headerText;

  if (packet.header.status === STATUS.NORMAL) {
    statusText += statusAsText[STATUS.NORMAL];
  } else {
    for (var status in statusAsText) {
      if (packet.header.status & status) {
        statusText += statusAsText[status] + ' ';
      }
    }
    statusText = statusText.trim();
  }
  
  headerText = sprintf('header - type:0x%02X(%s), status:0x%02X(%s), length:0x%04X, spid:0x%04X, packetId:0x%02X, window:0x%02X',
      packet.header.type, typesAsText[packet.header.type],
      packet.header.status, statusText,
      packet.header.length,
      packet.header.spid,
      packet.header.packetId,
      packet.header.window
  );
 
  return headerText;
}

function dataDump(packet) {
  const BYTES_PER_GROUP = 0x04,
        BYTES_PER_LINE = 0x20;
  var offset = 0,
      dataDump = '';

  while (offset < packet.data.length) {
    if (offset % BYTES_PER_LINE === 0) {
      dataDump += NL;
      dataDump += sprintf('  %04X  ', offset);
    }
    dataDump += sprintf('%02X', packet.data[offset]);
    
    offset++;

    if (offset % BYTES_PER_GROUP === 0) {
      dataDump += ' ';
    }
  }

  dataDump = dataDump.substr(1);
  return dataDump;
}

module.exports.Packet = Packet;
module.exports.isPacketComplete = isPacketComplete;
module.exports.TYPE = TYPE;
