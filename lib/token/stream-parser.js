'use strict';

var _getPrototypeOf = require('babel-runtime/core-js/object/get-prototype-of');

var _getPrototypeOf2 = _interopRequireDefault(_getPrototypeOf);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _possibleConstructorReturn2 = require('babel-runtime/helpers/possibleConstructorReturn');

var _possibleConstructorReturn3 = _interopRequireDefault(_possibleConstructorReturn2);

var _inherits2 = require('babel-runtime/helpers/inherits');

var _inherits3 = _interopRequireDefault(_inherits2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var Transform = require('readable-stream').Transform;
var TYPE = require('./token').TYPE;

var tokenParsers = {};
tokenParsers[TYPE.COLMETADATA] = require('./colmetadata-token-parser');
tokenParsers[TYPE.DONE] = require('./done-token-parser').doneParser;
tokenParsers[TYPE.DONEINPROC] = require('./done-token-parser').doneInProcParser;
tokenParsers[TYPE.DONEPROC] = require('./done-token-parser').doneProcParser;
tokenParsers[TYPE.ENVCHANGE] = require('./env-change-token-parser');
tokenParsers[TYPE.ERROR] = require('./infoerror-token-parser').errorParser;
tokenParsers[TYPE.INFO] = require('./infoerror-token-parser').infoParser;
tokenParsers[TYPE.LOGINACK] = require('./loginack-token-parser');
tokenParsers[TYPE.ORDER] = require('./order-token-parser');
tokenParsers[TYPE.RETURNSTATUS] = require('./returnstatus-token-parser');
tokenParsers[TYPE.RETURNVALUE] = require('./returnvalue-token-parser');
tokenParsers[TYPE.ROW] = require('./row-token-parser');
tokenParsers[TYPE.NBCROW] = require('./nbcrow-token-parser');
tokenParsers[TYPE.SSPI] = require('./sspi-token-parser');

module.exports = function (_Transform) {
  (0, _inherits3.default)(Parser, _Transform);

  function Parser(debug, colMetadata, options) {
    (0, _classCallCheck3.default)(this, Parser);

    var _this = (0, _possibleConstructorReturn3.default)(this, (Parser.__proto__ || (0, _getPrototypeOf2.default)(Parser)).call(this, { objectMode: true }));

    _this.debug = debug;
    _this.colMetadata = colMetadata;
    _this.options = options;

    _this.buffer = new Buffer(0);
    _this.position = 0;
    _this.suspended = false;
    _this.await = undefined;
    _this.next = undefined;
    return _this;
  }

  (0, _createClass3.default)(Parser, [{
    key: '_transform',
    value: function _transform(input, encoding, done) {
      if (this.position === this.buffer.length) {
        this.buffer = input;
      } else {
        this.buffer = Buffer.concat([this.buffer.slice(this.position), input]);
      }
      this.position = 0;

      // This will be called once we need to wait for more data to
      // become available
      this.await = done;

      if (this.suspended) {
        // Unsuspend and continue from where ever we left off.
        this.suspended = false;
        this.next.call(null);
      }

      // If we're no longer suspended, parse new tokens
      if (!this.suspended) {
        // Start the parser
        this.parseTokens();
      }
    }
  }, {
    key: 'parseTokens',
    value: function parseTokens() {
      var _this2 = this;

      var doneParsing = function doneParsing(token) {
        if (token) {
          switch (token.name) {
            case 'COLMETADATA':
              _this2.colMetadata = token.columns;
          }

          _this2.push(token);
        }
      };

      while (!this.suspended && this.position + 1 <= this.buffer.length) {
        var type = this.buffer.readUInt8(this.position, true);

        this.position += 1;

        if (tokenParsers[type]) {
          tokenParsers[type](this, this.colMetadata, this.options, doneParsing);
        } else {
          this.emit('error', new Error('Unknown type: ' + type));
        }
      }

      if (!this.suspended && this.position === this.buffer.length) {
        // If we reached the end of the buffer, we can stop parsing now.
        return this.await.call(null);
      }
    }
  }, {
    key: 'suspend',
    value: function suspend(next) {
      this.suspended = true;
      this.next = next;
      this.await.call(null);
    }
  }, {
    key: 'awaitData',
    value: function awaitData(length, callback) {
      var _this3 = this;

      if (this.position + length <= this.buffer.length) {
        callback();
      } else {
        this.suspend(function () {
          _this3.awaitData(length, callback);
        });
      }
    }
  }, {
    key: 'readInt8',
    value: function readInt8(callback) {
      var _this4 = this;

      this.awaitData(1, function () {
        var data = _this4.buffer.readInt8(_this4.position);
        _this4.position += 1;
        callback(data);
      });
    }
  }, {
    key: 'readUInt8',
    value: function readUInt8(callback) {
      var _this5 = this;

      this.awaitData(1, function () {
        var data = _this5.buffer.readUInt8(_this5.position);
        _this5.position += 1;
        callback(data);
      });
    }
  }, {
    key: 'readInt16LE',
    value: function readInt16LE(callback) {
      var _this6 = this;

      this.awaitData(2, function () {
        var data = _this6.buffer.readInt16LE(_this6.position);
        _this6.position += 2;
        callback(data);
      });
    }
  }, {
    key: 'readInt16BE',
    value: function readInt16BE(callback) {
      var _this7 = this;

      this.awaitData(2, function () {
        var data = _this7.buffer.readInt16BE(_this7.position);
        _this7.position += 2;
        callback(data);
      });
    }
  }, {
    key: 'readUInt16LE',
    value: function readUInt16LE(callback) {
      var _this8 = this;

      this.awaitData(2, function () {
        var data = _this8.buffer.readUInt16LE(_this8.position);
        _this8.position += 2;
        callback(data);
      });
    }
  }, {
    key: 'readUInt16BE',
    value: function readUInt16BE(callback) {
      var _this9 = this;

      this.awaitData(2, function () {
        var data = _this9.buffer.readUInt16BE(_this9.position);
        _this9.position += 2;
        callback(data);
      });
    }
  }, {
    key: 'readInt32LE',
    value: function readInt32LE(callback) {
      var _this10 = this;

      this.awaitData(4, function () {
        var data = _this10.buffer.readInt32LE(_this10.position);
        _this10.position += 4;
        callback(data);
      });
    }
  }, {
    key: 'readInt32BE',
    value: function readInt32BE(callback) {
      var _this11 = this;

      this.awaitData(4, function () {
        var data = _this11.buffer.readInt32BE(_this11.position);
        _this11.position += 4;
        callback(data);
      });
    }
  }, {
    key: 'readUInt32LE',
    value: function readUInt32LE(callback) {
      var _this12 = this;

      this.awaitData(4, function () {
        var data = _this12.buffer.readUInt32LE(_this12.position);
        _this12.position += 4;
        callback(data);
      });
    }
  }, {
    key: 'readUInt32BE',
    value: function readUInt32BE(callback) {
      var _this13 = this;

      this.awaitData(4, function () {
        var data = _this13.buffer.readUInt32BE(_this13.position);
        _this13.position += 4;
        callback(data);
      });
    }
  }, {
    key: 'readInt64LE',
    value: function readInt64LE(callback) {
      var _this14 = this;

      this.awaitData(8, function () {
        var data = Math.pow(2, 32) * _this14.buffer.readInt32LE(_this14.position + 4) + (_this14.buffer[_this14.position + 4] & 0x80 === 0x80 ? 1 : -1) * _this14.buffer.readUInt32LE(_this14.position);
        _this14.position += 8;
        callback(data);
      });
    }
  }, {
    key: 'readInt64BE',
    value: function readInt64BE(callback) {
      var _this15 = this;

      this.awaitData(8, function () {
        var data = Math.pow(2, 32) * _this15.buffer.readInt32BE(_this15.position) + (_this15.buffer[_this15.position] & 0x80 === 0x80 ? 1 : -1) * _this15.buffer.readUInt32BE(_this15.position + 4);
        _this15.position += 8;
        callback(data);
      });
    }
  }, {
    key: 'readUInt64LE',
    value: function readUInt64LE(callback) {
      var _this16 = this;

      this.awaitData(8, function () {
        var data = Math.pow(2, 32) * _this16.buffer.readUInt32LE(_this16.position + 4) + _this16.buffer.readUInt32LE(_this16.position);
        _this16.position += 8;
        callback(data);
      });
    }
  }, {
    key: 'readUInt64BE',
    value: function readUInt64BE(callback) {
      var _this17 = this;

      this.awaitData(8, function () {
        var data = Math.pow(2, 32) * _this17.buffer.readUInt32BE(_this17.position) + _this17.buffer.readUInt32BE(_this17.position + 4);
        _this17.position += 8;
        callback(data);
      });
    }
  }, {
    key: 'readFloatLE',
    value: function readFloatLE(callback) {
      var _this18 = this;

      this.awaitData(4, function () {
        var data = _this18.buffer.readFloatLE(_this18.position);
        _this18.position += 4;
        callback(data);
      });
    }
  }, {
    key: 'readFloatBE',
    value: function readFloatBE(callback) {
      var _this19 = this;

      this.awaitData(4, function () {
        var data = _this19.buffer.readFloatBE(_this19.position);
        _this19.position += 4;
        callback(data);
      });
    }
  }, {
    key: 'readDoubleLE',
    value: function readDoubleLE(callback) {
      var _this20 = this;

      this.awaitData(8, function () {
        var data = _this20.buffer.readDoubleLE(_this20.position);
        _this20.position += 8;
        callback(data);
      });
    }
  }, {
    key: 'readDoubleBE',
    value: function readDoubleBE(callback) {
      var _this21 = this;

      this.awaitData(8, function () {
        var data = _this21.buffer.readDoubleBE(_this21.position);
        _this21.position += 8;
        callback(data);
      });
    }
  }, {
    key: 'readUInt24LE',
    value: function readUInt24LE(callback) {
      var _this22 = this;

      this.awaitData(3, function () {
        var low = _this22.buffer.readUInt16LE(_this22.position);
        var high = _this22.buffer.readUInt8(_this22.position + 2);

        _this22.position += 3;

        callback(low | high << 16);
      });
    }
  }, {
    key: 'readUInt40LE',
    value: function readUInt40LE(callback) {
      var _this23 = this;

      this.awaitData(5, function () {
        var low = _this23.buffer.readUInt32LE(_this23.position);
        var high = _this23.buffer.readUInt8(_this23.position + 4);

        _this23.position += 5;

        callback(0x100000000 * high + low);
      });
    }
  }, {
    key: 'readUNumeric64LE',
    value: function readUNumeric64LE(callback) {
      var _this24 = this;

      this.awaitData(8, function () {
        var low = _this24.buffer.readUInt32LE(_this24.position);
        var high = _this24.buffer.readUInt32LE(_this24.position + 4);

        _this24.position += 8;

        callback(0x100000000 * high + low);
      });
    }
  }, {
    key: 'readUNumeric96LE',
    value: function readUNumeric96LE(callback) {
      var _this25 = this;

      this.awaitData(12, function () {
        var dword1 = _this25.buffer.readUInt32LE(_this25.position);
        var dword2 = _this25.buffer.readUInt32LE(_this25.position + 4);
        var dword3 = _this25.buffer.readUInt32LE(_this25.position + 8);

        _this25.position += 12;

        callback(dword1 + 0x100000000 * dword2 + 0x100000000 * 0x100000000 * dword3);
      });
    }
  }, {
    key: 'readUNumeric128LE',
    value: function readUNumeric128LE(callback) {
      var _this26 = this;

      this.awaitData(16, function () {
        var dword1 = _this26.buffer.readUInt32LE(_this26.position);
        var dword2 = _this26.buffer.readUInt32LE(_this26.position + 4);
        var dword3 = _this26.buffer.readUInt32LE(_this26.position + 8);
        var dword4 = _this26.buffer.readUInt32LE(_this26.position + 12);

        _this26.position += 16;

        callback(dword1 + 0x100000000 * dword2 + 0x100000000 * 0x100000000 * dword3 + 0x100000000 * 0x100000000 * 0x100000000 * dword4);
      });
    }

    // Variable length data

  }, {
    key: 'readBuffer',
    value: function readBuffer(length, callback) {
      var _this27 = this;

      this.awaitData(length, function () {
        var data = _this27.buffer.slice(_this27.position, _this27.position + length);
        _this27.position += length;
        callback(data);
      });
    }

    // Read a Unicode String (BVARCHAR)

  }, {
    key: 'readBVarChar',
    value: function readBVarChar(callback) {
      var _this28 = this;

      this.readUInt8(function (length) {
        _this28.readBuffer(length * 2, function (data) {
          callback(data.toString('ucs2'));
        });
      });
    }

    // Read a Unicode String (USVARCHAR)

  }, {
    key: 'readUsVarChar',
    value: function readUsVarChar(callback) {
      var _this29 = this;

      this.readUInt16LE(function (length) {
        _this29.readBuffer(length * 2, function (data) {
          callback(data.toString('ucs2'));
        });
      });
    }

    // Read binary data (BVARBYTE)

  }, {
    key: 'readBVarByte',
    value: function readBVarByte(callback) {
      var _this30 = this;

      this.readUInt8(function (length) {
        _this30.readBuffer(length, callback);
      });
    }

    // Read binary data (USVARBYTE)

  }, {
    key: 'readUsVarByte',
    value: function readUsVarByte(callback) {
      var _this31 = this;

      this.readUInt16LE(function (length) {
        _this31.readBuffer(length, callback);
      });
    }
  }]);
  return Parser;
}(Transform);