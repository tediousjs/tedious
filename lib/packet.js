'use strict';

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

require('./buffertools');

var sprintf = require('sprintf').sprintf;

var HEADER_LENGTH = module.exports.HEADER_LENGTH = 8;

var TYPE = module.exports.TYPE = {
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

var typeByValue = {};

for (var name in TYPE) {
  typeByValue[TYPE[name]] = name;
}

var STATUS = {
  NORMAL: 0x00,
  EOM: 0x01,
  IGNORE: 0x02,
  RESETCONNECTION: 0x08,
  RESETCONNECTIONSKIPTRAN: 0x10
};

var OFFSET = module.exports.OFFSET = {
  Type: 0,
  Status: 1,
  Length: 2,
  SPID: 4,
  PacketID: 6,
  Window: 7
};

var DEFAULT_SPID = 0;

var DEFAULT_PACKETID = 1;

var DEFAULT_WINDOW = 0;

var NL = '\n';

var Packet = function () {
  function Packet(typeOrBuffer) {
    (0, _classCallCheck3.default)(this, Packet);

    if (typeOrBuffer instanceof Buffer) {
      this.buffer = typeOrBuffer;
    } else {
      var type = typeOrBuffer;
      this.buffer = new Buffer(HEADER_LENGTH);
      this.buffer.writeUInt8(type, OFFSET.Type);
      this.buffer.writeUInt8(STATUS.NORMAL, OFFSET.Status);
      this.buffer.writeUInt16BE(DEFAULT_SPID, OFFSET.SPID);
      this.buffer.writeUInt8(DEFAULT_PACKETID, OFFSET.PacketID);
      this.buffer.writeUInt8(DEFAULT_WINDOW, OFFSET.Window);
      this.setLength();
    }
  }

  (0, _createClass3.default)(Packet, [{
    key: 'setLength',
    value: function setLength() {
      return this.buffer.writeUInt16BE(this.buffer.length, OFFSET.Length);
    }
  }, {
    key: 'length',
    value: function length() {
      return this.buffer.readUInt16BE(OFFSET.Length);
    }
  }, {
    key: 'resetConnection',
    value: function resetConnection(reset) {
      var status = this.buffer.readUInt8(OFFSET.Status);
      if (reset) {
        status |= STATUS.RESETCONNECTION;
      } else {
        status &= 0xFF - STATUS.RESETCONNECTION;
      }
      return this.buffer.writeUInt8(status, OFFSET.Status);
    }
  }, {
    key: 'last',
    value: function last(_last) {
      var status = this.buffer.readUInt8(OFFSET.Status);
      if (arguments.length > 0) {
        if (_last) {
          status |= STATUS.EOM;
        } else {
          status &= 0xFF - STATUS.EOM;
        }
        this.buffer.writeUInt8(status, OFFSET.Status);
      }
      return this.isLast();
    }
  }, {
    key: 'isLast',
    value: function isLast() {
      return !!(this.buffer.readUInt8(OFFSET.Status) & STATUS.EOM);
    }
  }, {
    key: 'packetId',
    value: function packetId(_packetId) {
      if (_packetId) {
        this.buffer.writeUInt8(_packetId % 256, OFFSET.PacketID);
      }
      return this.buffer.readUInt8(OFFSET.PacketID);
    }
  }, {
    key: 'addData',
    value: function addData(data) {
      this.buffer = Buffer.concat([this.buffer, data]);
      this.setLength();
      return this;
    }
  }, {
    key: 'data',
    value: function data() {
      return this.buffer.slice(HEADER_LENGTH);
    }
  }, {
    key: 'type',
    value: function type() {
      return this.buffer.readUInt8(OFFSET.Type);
    }
  }, {
    key: 'statusAsString',
    value: function statusAsString() {
      var status = this.buffer.readUInt8(OFFSET.Status);
      var statuses = [];

      for (var _name in STATUS) {
        var value = STATUS[_name];

        if (status & value) {
          statuses.push(_name);
        } else {
          statuses.push(undefined);
        }
      }

      return statuses.join(' ').trim();
    }
  }, {
    key: 'headerToString',
    value: function headerToString(indent) {
      indent || (indent = '');
      var text = sprintf('type:0x%02X(%s), status:0x%02X(%s), length:0x%04X, spid:0x%04X, packetId:0x%02X, window:0x%02X', this.buffer.readUInt8(OFFSET.Type), typeByValue[this.buffer.readUInt8(OFFSET.Type)], this.buffer.readUInt8(OFFSET.Status), this.statusAsString(), this.buffer.readUInt16BE(OFFSET.Length), this.buffer.readUInt16BE(OFFSET.SPID), this.buffer.readUInt8(OFFSET.PacketID), this.buffer.readUInt8(OFFSET.Window));
      return indent + text;
    }
  }, {
    key: 'dataToString',
    value: function dataToString(indent) {
      indent || (indent = '');

      var BYTES_PER_GROUP = 0x04;
      var CHARS_PER_GROUP = 0x08;
      var BYTES_PER_LINE = 0x20;
      var data = this.data();

      var dataDump = '';
      var chars = '';

      for (var offset = 0; offset < data.length; offset++) {
        if (offset % BYTES_PER_LINE === 0) {
          dataDump += indent;
          dataDump += sprintf('%04X  ', offset);
        }

        if (data[offset] < 0x20 || data[offset] > 0x7E) {
          chars += '.';
          if ((offset + 1) % CHARS_PER_GROUP === 0 && !((offset + 1) % BYTES_PER_LINE === 0)) {
            chars += ' ';
          }
        } else {
          chars += String.fromCharCode(data[offset]);
        }

        if (data[offset] != null) {
          dataDump += sprintf('%02X', data[offset]);
        }

        if ((offset + 1) % BYTES_PER_GROUP === 0 && !((offset + 1) % BYTES_PER_LINE === 0)) {
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
  }, {
    key: 'toString',
    value: function toString(indent) {
      indent || (indent = '');
      return this.headerToString(indent) + '\n' + this.dataToString(indent + indent);
    }
  }, {
    key: 'payloadString',
    value: function payloadString() {
      return '';
    }
  }]);
  return Packet;
}();

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