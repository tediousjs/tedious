'use strict';

require('./buffertools');

const sprintf = require('sprintf').sprintf;

const HEADER_LENGTH = module.exports.HEADER_LENGTH = 8;

const TYPE = module.exports.TYPE = {
  SQL_BATCH: 0x01,
  RPC_REQUEST: 0x03,
  TABULAR_RESULT: 0x04,
  ATTENTION: 0x06,
  BULK_LOAD: 0x07,
  TRANSACTION_MANAGER: 0x0E,
  LOGIN7: 0x10,
  NTLMAUTH_PKT: 0x11,
  PRELOGIN: 0x12
};

const typeByValue = {};

for (const name in TYPE) {
  typeByValue[TYPE[name]] = name;
}

const STATUS = {
  NORMAL: 0x00,
  EOM: 0x01,
  IGNORE: 0x02,
  RESETCONNECTION: 0x08,
  RESETCONNECTIONSKIPTRAN: 0x10
};

const OFFSET = module.exports.OFFSET = {
  Type: 0,
  Status: 1,
  Length: 2,
  SPID: 4,
  PacketID: 6,
  Window: 7
};

const DEFAULT_SPID = 0;

const DEFAULT_PACKETID = 1;

const DEFAULT_WINDOW = 0;

const NL = '\n';

class Packet {
  constructor(typeOrBuffer) {
    if (typeOrBuffer instanceof Buffer) {
      this.buffer = typeOrBuffer;
    } else {
      const type = typeOrBuffer;
      this.buffer = new Buffer(HEADER_LENGTH);
      this.buffer.writeUInt8(type, OFFSET.Type);
      this.buffer.writeUInt8(STATUS.NORMAL, OFFSET.Status);
      this.buffer.writeUInt16BE(DEFAULT_SPID, OFFSET.SPID);
      this.buffer.writeUInt8(DEFAULT_PACKETID, OFFSET.PacketID);
      this.buffer.writeUInt8(DEFAULT_WINDOW, OFFSET.Window);
      this.setLength();
    }
  }

  setLength() {
    return this.buffer.writeUInt16BE(this.buffer.length, OFFSET.Length);
  }

  length() {
    return this.buffer.readUInt16BE(OFFSET.Length);
  }

  resetConnection(reset) {
    let status = this.buffer.readUInt8(OFFSET.Status);
    if (reset) {
      status |= STATUS.RESETCONNECTION;
    } else {
      status &= 0xFF - STATUS.RESETCONNECTION;
    }
    return this.buffer.writeUInt8(status, OFFSET.Status);
  }

  last(last) {
    let status = this.buffer.readUInt8(OFFSET.Status);
    if (arguments.length > 0) {
      if (last) {
        status |= STATUS.EOM;
      } else {
        status &= 0xFF - STATUS.EOM;
      }
      this.buffer.writeUInt8(status, OFFSET.Status);
    }
    return this.isLast();
  }

  isLast() {
    return !!(this.buffer.readUInt8(OFFSET.Status) & STATUS.EOM);
  }

  packetId(packetId) {
    if (packetId) {
      this.buffer.writeUInt8(packetId % 256, OFFSET.PacketID);
    }
    return this.buffer.readUInt8(OFFSET.PacketID);
  }

  addData(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    this.setLength();
    return this;
  }

  data() {
    return this.buffer.slice(HEADER_LENGTH);
  }

  type() {
    return this.buffer.readUInt8(OFFSET.Type);
  }

  statusAsString() {
    const status = this.buffer.readUInt8(OFFSET.Status);
    const statuses = [];

    for (const name in STATUS) {
      const value = STATUS[name];

      if (status & value) {
        statuses.push(name);
      } else {
        statuses.push(undefined);
      }
    }

    return statuses.join(' ').trim();
  }

  headerToString(indent) {
    indent || (indent = '');
    const text = sprintf('type:0x%02X(%s), status:0x%02X(%s), length:0x%04X, spid:0x%04X, packetId:0x%02X, window:0x%02X', this.buffer.readUInt8(OFFSET.Type), typeByValue[this.buffer.readUInt8(OFFSET.Type)], this.buffer.readUInt8(OFFSET.Status), this.statusAsString(), this.buffer.readUInt16BE(OFFSET.Length), this.buffer.readUInt16BE(OFFSET.SPID), this.buffer.readUInt8(OFFSET.PacketID), this.buffer.readUInt8(OFFSET.Window));
    return indent + text;
  }

  dataToString(indent) {
    indent || (indent = '');

    const BYTES_PER_GROUP = 0x04;
    const CHARS_PER_GROUP = 0x08;
    const BYTES_PER_LINE = 0x20;
    const data = this.data();

    let dataDump = '';
    let chars = '';


    for (let offset = 0; offset < data.length; offset++) {
      if (offset % BYTES_PER_LINE === 0) {
        dataDump += indent;
        dataDump += sprintf('%04X  ', offset);
      }

      if (data[offset] < 0x20 || data[offset] > 0x7E) {
        chars += '.';
        if (((offset + 1) % CHARS_PER_GROUP === 0) && !((offset + 1) % BYTES_PER_LINE === 0)) {
          chars += ' ';
        }
      } else {
        chars += String.fromCharCode(data[offset]);
      }

      if (data[offset] != null) {
        dataDump += sprintf('%02X', data[offset]);
      }

      if (((offset + 1) % BYTES_PER_GROUP === 0) && !((offset + 1) % BYTES_PER_LINE === 0)) {
        dataDump += ' ';
      }

      if ((offset + 1) % BYTES_PER_LINE === 0) {
        dataDump += '  ' + chars;
        chars = '';
        if (offset < data.length - 1) {
          dataDump += NL;
        }
      }
    }

    if (chars.length) {
      dataDump += '  ' + chars;
    }

    return dataDump;
  }

  toString(indent) {
    indent || (indent = '');
    return this.headerToString(indent) + '\n' + this.dataToString(indent + indent);
  }

  payloadString() {
    return '';
  }
}
module.exports.Packet = Packet;

module.exports.isPacketComplete = isPacketComplete;
function isPacketComplete(potentialPacketBuffer) {
  if (potentialPacketBuffer.length < HEADER_LENGTH) {
    return false;
  } else {
    return potentialPacketBuffer.length >= potentialPacketBuffer.readUInt16BE(OFFSET.Length);
  }
}

module.exports.packetLength = packetLength;
function packetLength(potentialPacketBuffer) {
  return potentialPacketBuffer.readUInt16BE(OFFSET.Length);
}
