'use strict';

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var bigint = require('./bigint');

require('../buffertools');

var SHIFT_LEFT_32 = (1 << 16) * (1 << 16);
var SHIFT_RIGHT_32 = 1 / SHIFT_LEFT_32;
var UNKNOWN_PLP_LEN = new Buffer([0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

/*
  A Buffer-like class that tracks position.

  As values are written, the position advances by the size of the written data.
  When writing, automatically allocates new buffers if there's not enough space.
 */
module.exports = function () {
  function WritableTrackingBuffer(initialSize, encoding, doubleSizeGrowth) {
    (0, _classCallCheck3.default)(this, WritableTrackingBuffer);

    this.initialSize = initialSize;
    this.encoding = encoding;
    this.doubleSizeGrowth = doubleSizeGrowth;
    this.doubleSizeGrowth || (this.doubleSizeGrowth = false);
    this.encoding || (this.encoding = 'ucs2');
    this.buffer = new Buffer(this.initialSize);
    this.position = 0;
  }

  (0, _createClass3.default)(WritableTrackingBuffer, [{
    key: 'copyFrom',
    value: function copyFrom(buffer) {
      var length = buffer.length;
      this.makeRoomFor(length);
      buffer.copy(this.buffer, this.position);
      return this.position += length;
    }
  }, {
    key: 'makeRoomFor',
    value: function makeRoomFor(requiredLength) {
      if (this.buffer.length - this.position < requiredLength) {
        if (this.doubleSizeGrowth) {
          var size = this.buffer.length * 2;
          while (size < requiredLength) {
            size *= 2;
          }
          return this.newBuffer(size);
        } else {
          return this.newBuffer(requiredLength);
        }
      }
    }
  }, {
    key: 'newBuffer',
    value: function newBuffer(size) {
      size || (size = this.initialSize);
      var buffer = this.buffer.slice(0, this.position);
      if (this.compositeBuffer) {
        this.compositeBuffer = Buffer.concat([this.compositeBuffer, buffer]);
      } else {
        this.compositeBuffer = buffer;
      }
      this.buffer = new Buffer(size);
      return this.position = 0;
    }
  }, {
    key: 'writeUInt8',
    value: function writeUInt8(value) {
      var length = 1;
      this.makeRoomFor(length);
      this.buffer.writeUInt8(value, this.position);
      return this.position += length;
    }
  }, {
    key: 'writeUInt16LE',
    value: function writeUInt16LE(value) {
      var length = 2;
      this.makeRoomFor(length);
      this.buffer.writeUInt16LE(value, this.position);
      return this.position += length;
    }
  }, {
    key: 'writeUShort',
    value: function writeUShort(value) {
      return this.writeUInt16LE(value);
    }
  }, {
    key: 'writeUInt16BE',
    value: function writeUInt16BE(value) {
      var length = 2;
      this.makeRoomFor(length);
      this.buffer.writeUInt16BE(value, this.position);
      return this.position += length;
    }
  }, {
    key: 'writeUInt24LE',
    value: function writeUInt24LE(value) {
      var length = 3;
      this.makeRoomFor(length);
      this.buffer[this.position + 2] = value >>> 16 & 0xff;
      this.buffer[this.position + 1] = value >>> 8 & 0xff;
      this.buffer[this.position] = value & 0xff;
      return this.position += length;
    }
  }, {
    key: 'writeUInt32LE',
    value: function writeUInt32LE(value) {
      var length = 4;
      this.makeRoomFor(length);
      this.buffer.writeUInt32LE(value, this.position);
      return this.position += length;
    }
  }, {
    key: 'writeInt64LE',
    value: function writeInt64LE(value) {
      var buf = bigint.numberToInt64LE(value);
      return this.copyFrom(buf);
    }
  }, {
    key: 'writeUInt32BE',
    value: function writeUInt32BE(value) {
      var length = 4;
      this.makeRoomFor(length);
      this.buffer.writeUInt32BE(value, this.position);
      return this.position += length;
    }
  }, {
    key: 'writeUInt40LE',
    value: function writeUInt40LE(value) {
      // inspired by https://github.com/dpw/node-buffer-more-ints
      this.writeInt32LE(value & -1);
      return this.writeUInt8(Math.floor(value * SHIFT_RIGHT_32));
    }
  }, {
    key: 'writeUInt64LE',
    value: function writeUInt64LE(value) {
      this.writeInt32LE(value & -1);
      return this.writeUInt32LE(Math.floor(value * SHIFT_RIGHT_32));
    }
  }, {
    key: 'writeInt8',
    value: function writeInt8(value) {
      var length = 1;
      this.makeRoomFor(length);
      this.buffer.writeInt8(value, this.position);
      return this.position += length;
    }
  }, {
    key: 'writeInt16LE',
    value: function writeInt16LE(value) {
      var length = 2;
      this.makeRoomFor(length);
      this.buffer.writeInt16LE(value, this.position);
      return this.position += length;
    }
  }, {
    key: 'writeInt16BE',
    value: function writeInt16BE(value) {
      var length = 2;
      this.makeRoomFor(length);
      this.buffer.writeInt16BE(value, this.position);
      return this.position += length;
    }
  }, {
    key: 'writeInt32LE',
    value: function writeInt32LE(value) {
      var length = 4;
      this.makeRoomFor(length);
      this.buffer.writeInt32LE(value, this.position);
      return this.position += length;
    }
  }, {
    key: 'writeInt32BE',
    value: function writeInt32BE(value) {
      var length = 4;
      this.makeRoomFor(length);
      this.buffer.writeInt32BE(value, this.position);
      return this.position += length;
    }
  }, {
    key: 'writeFloatLE',
    value: function writeFloatLE(value) {
      var length = 4;
      this.makeRoomFor(length);
      this.buffer.writeFloatLE(value, this.position);
      return this.position += length;
    }
  }, {
    key: 'writeDoubleLE',
    value: function writeDoubleLE(value) {
      var length = 8;
      this.makeRoomFor(length);
      this.buffer.writeDoubleLE(value, this.position);
      return this.position += length;
    }
  }, {
    key: 'writeString',
    value: function writeString(value, encoding) {
      encoding || (encoding = this.encoding);

      var length = Buffer.byteLength(value, encoding);
      this.makeRoomFor(length);

      var bytesWritten = this.buffer.write(value, this.position, encoding);
      this.position += length;

      return bytesWritten;
    }
  }, {
    key: 'writeBVarchar',
    value: function writeBVarchar(value, encoding) {
      this.writeUInt8(value.length);
      return this.writeString(value, encoding);
    }
  }, {
    key: 'writeUsVarchar',
    value: function writeUsVarchar(value, encoding) {
      this.writeUInt16LE(value.length);
      return this.writeString(value, encoding);
    }
  }, {
    key: 'writeUsVarbyte',
    value: function writeUsVarbyte(value, encoding) {
      if (encoding == null) {
        encoding = this.encoding;
      }

      var length = void 0;
      if (Buffer.isBuffer(value)) {
        length = value.length;
      } else {
        value = value.toString();
        length = Buffer.byteLength(value, encoding);
      }
      this.writeUInt16LE(length);

      if (Buffer.isBuffer(value)) {
        return this.writeBuffer(value);
      } else {
        this.makeRoomFor(length);
        this.buffer.write(value, this.position, encoding);
        return this.position += length;
      }
    }
  }, {
    key: 'writePLPBody',
    value: function writePLPBody(value, encoding) {
      if (encoding == null) {
        encoding = this.encoding;
      }

      var length = void 0;
      if (Buffer.isBuffer(value)) {
        length = value.length;
      } else {
        value = value.toString();
        length = Buffer.byteLength(value, encoding);
      }

      // Length of all chunks.
      // this.writeUInt64LE(length);
      // unknown seems to work better here - might revisit later.
      this.writeBuffer(UNKNOWN_PLP_LEN);

      // In the UNKNOWN_PLP_LEN case, the data is represented as a series of zero or more chunks.
      if (length > 0) {
        // One chunk.
        this.writeUInt32LE(length);
        if (Buffer.isBuffer(value)) {
          this.writeBuffer(value);
        } else {
          this.makeRoomFor(length);
          this.buffer.write(value, this.position, encoding);
          this.position += length;
        }
      }

      // PLP_TERMINATOR (no more chunks).
      return this.writeUInt32LE(0);
    }
  }, {
    key: 'writeBuffer',
    value: function writeBuffer(value) {
      var length = value.length;
      this.makeRoomFor(length);
      value.copy(this.buffer, this.position);
      return this.position += length;
    }
  }, {
    key: 'writeMoney',
    value: function writeMoney(value) {
      this.writeInt32LE(Math.floor(value * SHIFT_RIGHT_32));
      return this.writeInt32LE(value & -1);
    }
  }, {
    key: 'data',
    get: function get() {
      this.newBuffer(0);
      return this.compositeBuffer;
    }
  }]);
  return WritableTrackingBuffer;
}();