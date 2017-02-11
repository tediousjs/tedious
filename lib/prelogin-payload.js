'use strict';

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var sprintf = require('sprintf').sprintf;
var WritableTrackingBuffer = require('./tracking-buffer/tracking-buffer').WritableTrackingBuffer;

var optionBufferSize = 20;

var VERSION = 0x000000001;

var SUBBUILD = 0x0001;

var TOKEN = {
  VERSION: 0x00,
  ENCRYPTION: 0x01,
  INSTOPT: 0x02,
  THREADID: 0x03,
  MARS: 0x04,
  TERMINATOR: 0xFF
};

var ENCRYPT = {
  OFF: 0x00,
  ON: 0x01,
  NOT_SUP: 0x02,
  REQ: 0x03
};

var encryptByValue = {};

for (var name in ENCRYPT) {
  var value = ENCRYPT[name];
  encryptByValue[value] = name;
}

var MARS = {
  OFF: 0x00,
  ON: 0x01
};

var marsByValue = {};

for (var _name in MARS) {
  var _value = MARS[_name];
  marsByValue[_value] = _name;
}

/*
  s2.2.6.4
 */
module.exports = function () {
  function PreloginPayload(bufferOrOptions) {
    (0, _classCallCheck3.default)(this, PreloginPayload);

    if (bufferOrOptions instanceof Buffer) {
      this.data = bufferOrOptions;
    } else {
      this.options = bufferOrOptions || {};
      this.createOptions();
    }
    this.extractOptions();
  }

  (0, _createClass3.default)(PreloginPayload, [{
    key: 'createOptions',
    value: function createOptions() {
      var options = [this.createVersionOption(), this.createEncryptionOption(), this.createInstanceOption(), this.createThreadIdOption(), this.createMarsOption()];

      var length = 0;
      for (var i = 0, len = options.length; i < len; i++) {
        var option = options[i];
        length += 5 + option.data.length;
      }
      length++; // terminator
      this.data = new Buffer(length);
      var optionOffset = 0;
      var optionDataOffset = 5 * options.length + 1;

      for (var j = 0, _len = options.length; j < _len; j++) {
        var _option = options[j];
        this.data.writeUInt8(_option.token, optionOffset + 0);
        this.data.writeUInt16BE(optionDataOffset, optionOffset + 1);
        this.data.writeUInt16BE(_option.data.length, optionOffset + 3);
        optionOffset += 5;
        _option.data.copy(this.data, optionDataOffset);
        optionDataOffset += _option.data.length;
      }

      return this.data.writeUInt8(TOKEN.TERMINATOR, optionOffset);
    }
  }, {
    key: 'createVersionOption',
    value: function createVersionOption() {
      var buffer = new WritableTrackingBuffer(optionBufferSize);
      buffer.writeUInt32BE(VERSION);
      buffer.writeUInt16BE(SUBBUILD);
      return {
        token: TOKEN.VERSION,
        data: buffer.data
      };
    }
  }, {
    key: 'createEncryptionOption',
    value: function createEncryptionOption() {
      var buffer = new WritableTrackingBuffer(optionBufferSize);
      if (this.options.encrypt) {
        buffer.writeUInt8(ENCRYPT.ON);
      } else {
        buffer.writeUInt8(ENCRYPT.NOT_SUP);
      }
      return {
        token: TOKEN.ENCRYPTION,
        data: buffer.data
      };
    }
  }, {
    key: 'createInstanceOption',
    value: function createInstanceOption() {
      var buffer = new WritableTrackingBuffer(optionBufferSize);
      buffer.writeUInt8(0x00);
      return {
        token: TOKEN.INSTOPT,
        data: buffer.data
      };
    }
  }, {
    key: 'createThreadIdOption',
    value: function createThreadIdOption() {
      var buffer = new WritableTrackingBuffer(optionBufferSize);
      buffer.writeUInt32BE(0x00);
      return {
        token: TOKEN.THREADID,
        data: buffer.data
      };
    }
  }, {
    key: 'createMarsOption',
    value: function createMarsOption() {
      var buffer = new WritableTrackingBuffer(optionBufferSize);
      buffer.writeUInt8(MARS.OFF);
      return {
        token: TOKEN.MARS,
        data: buffer.data
      };
    }
  }, {
    key: 'extractOptions',
    value: function extractOptions() {
      var offset = 0;
      while (this.data[offset] !== TOKEN.TERMINATOR) {
        var dataOffset = this.data.readUInt16BE(offset + 1);
        var dataLength = this.data.readUInt16BE(offset + 3);
        switch (this.data[offset]) {
          case TOKEN.VERSION:
            this.extractVersion(dataOffset);
            break;
          case TOKEN.ENCRYPTION:
            this.extractEncryption(dataOffset);
            break;
          case TOKEN.INSTOPT:
            this.extractInstance(dataOffset);
            break;
          case TOKEN.THREADID:
            if (dataLength > 0) {
              this.extractThreadId(dataOffset);
            }
            break;
          case TOKEN.MARS:
            this.extractMars(dataOffset);
        }
        offset += 5;
        dataOffset += dataLength;
      }
    }
  }, {
    key: 'extractVersion',
    value: function extractVersion(offset) {
      return this.version = {
        major: this.data.readUInt8(offset + 0),
        minor: this.data.readUInt8(offset + 1),
        patch: this.data.readUInt8(offset + 2),
        trivial: this.data.readUInt8(offset + 3),
        subbuild: this.data.readUInt16BE(offset + 4)
      };
    }
  }, {
    key: 'extractEncryption',
    value: function extractEncryption(offset) {
      this.encryption = this.data.readUInt8(offset);
      return this.encryptionString = encryptByValue[this.encryption];
    }
  }, {
    key: 'extractInstance',
    value: function extractInstance(offset) {
      return this.instance = this.data.readUInt8(offset);
    }
  }, {
    key: 'extractThreadId',
    value: function extractThreadId(offset) {
      return this.threadId = this.data.readUInt32BE(offset);
    }
  }, {
    key: 'extractMars',
    value: function extractMars(offset) {
      this.mars = this.data.readUInt8(offset);
      return this.marsString = marsByValue[this.mars];
    }
  }, {
    key: 'toString',
    value: function toString(indent) {
      indent || (indent = '');
      return indent + 'PreLogin - ' + sprintf('version:%d.%d.%d.%d %d, encryption:0x%02X(%s), instopt:0x%02X, threadId:0x%08X, mars:0x%02X(%s)', this.version.major, this.version.minor, this.version.patch, this.version.trivial, this.version.subbuild, this.encryption ? this.encryption : 0, this.encryptionString ? this.encryptionString : 0, this.instance ? this.instance : 0, this.threadId ? this.threadId : 0, this.mars ? this.mars : 0, this.marsString ? this.marsString : 0);
    }
  }]);
  return PreloginPayload;
}();