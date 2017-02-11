'use strict';

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var convertLEBytesToString = require('./bigint').convertLEBytesToString;

/*
  A Buffer-like class that tracks position.

  As values are read, the position advances by the size of the read data.
  When reading, if the read would pass the end of the buffer, an error object is thrown.
 */

module.exports = function () {
  function ReadableTrackingBuffer(buffer, encoding) {
    (0, _classCallCheck3.default)(this, ReadableTrackingBuffer);

    this.buffer = buffer;
    this.encoding = encoding;
    if (!this.buffer) {
      this.buffer = new Buffer(0);
      this.encoding = void 0;
    }
    this.encoding || (this.encoding = 'utf8');
    this.position = 0;
  }

  (0, _createClass3.default)(ReadableTrackingBuffer, [{
    key: 'add',
    value: function add(buffer) {
      this.buffer = Buffer.concat([this.buffer.slice(this.position), buffer]);
      return this.position = 0;
    }
  }, {
    key: 'assertEnoughLeftFor',
    value: function assertEnoughLeftFor(lengthRequired) {
      this.previousPosition = this.position;
      var available = this.buffer.length - this.position;
      if (available < lengthRequired) {
        var e = new Error('required : ' + lengthRequired + ', available : ' + available);
        e.code = 'oob';
        throw e;
      }
    }
  }, {
    key: 'empty',
    value: function empty() {
      return this.position === this.buffer.length;
    }
  }, {
    key: 'rollback',
    value: function rollback() {
      return this.position = this.previousPosition;
    }
  }, {
    key: 'readUInt8',
    value: function readUInt8() {
      var length = 1;
      this.assertEnoughLeftFor(length);
      this.position += length;
      return this.buffer.readUInt8(this.position - length);
    }
  }, {
    key: 'readUInt16LE',
    value: function readUInt16LE() {
      var length = 2;
      this.assertEnoughLeftFor(length);
      this.position += length;
      return this.buffer.readUInt16LE(this.position - length);
    }
  }, {
    key: 'readUInt16BE',
    value: function readUInt16BE() {
      var length = 2;
      this.assertEnoughLeftFor(length);
      this.position += length;
      return this.buffer.readUInt16BE(this.position - length);
    }
  }, {
    key: 'readUInt32LE',
    value: function readUInt32LE() {
      var length = 4;
      this.assertEnoughLeftFor(length);
      this.position += length;
      return this.buffer.readUInt32LE(this.position - length);
    }
  }, {
    key: 'readUInt32BE',
    value: function readUInt32BE() {
      var length = 4;
      this.assertEnoughLeftFor(length);
      this.position += length;
      return this.buffer.readUInt32BE(this.position - length);
    }
  }, {
    key: 'readInt8',
    value: function readInt8() {
      var length = 1;
      this.assertEnoughLeftFor(length);
      this.position += length;
      return this.buffer.readInt8(this.position - length);
    }
  }, {
    key: 'readInt16LE',
    value: function readInt16LE() {
      var length = 2;
      this.assertEnoughLeftFor(length);
      this.position += length;
      return this.buffer.readInt16LE(this.position - length);
    }
  }, {
    key: 'readInt16BE',
    value: function readInt16BE() {
      var length = 2;
      this.assertEnoughLeftFor(length);
      this.position += length;
      return this.buffer.readInt16BE(this.position - length);
    }
  }, {
    key: 'readInt32LE',
    value: function readInt32LE() {
      var length = 4;
      this.assertEnoughLeftFor(length);
      this.position += length;
      return this.buffer.readInt32LE(this.position - length);
    }
  }, {
    key: 'readInt32BE',
    value: function readInt32BE() {
      var length = 4;
      this.assertEnoughLeftFor(length);
      this.position += length;
      return this.buffer.readInt32BE(this.position - length);
    }
  }, {
    key: 'readFloatLE',
    value: function readFloatLE() {
      var length = 4;
      this.assertEnoughLeftFor(length);
      this.position += length;
      return this.buffer.readFloatLE(this.position - length);
    }
  }, {
    key: 'readDoubleLE',
    value: function readDoubleLE() {
      var length = 8;
      this.assertEnoughLeftFor(length);
      this.position += length;
      return this.buffer.readDoubleLE(this.position - length);
    }
  }, {
    key: 'readUInt24LE',
    value: function readUInt24LE() {
      var length = 3;
      this.assertEnoughLeftFor(length);
      var val = this.buffer[this.position + 1] << 8;
      val |= this.buffer[this.position];
      val += this.buffer[this.position + 2] << 16 >>> 0;
      this.position += length;
      return val;
    }
  }, {
    key: 'readUInt40LE',
    value: function readUInt40LE() {
      var low = this.readBuffer(4).readUInt32LE(0);
      var high = Buffer.concat([this.readBuffer(1), new Buffer([0x00, 0x00, 0x00])]).readUInt32LE(0);
      return low + 0x100000000 * high;
    }

    // If value > 53 bits then it will be incorrect (because Javascript uses IEEE_754 for number representation).

  }, {
    key: 'readUInt64LE',
    value: function readUInt64LE() {
      var low = this.readUInt32LE();
      var high = this.readUInt32LE();
      if (high >= 2 << 53 - 32) {
        console.warn('Read UInt64LE > 53 bits : high=' + high + ', low=' + low);
      }
      return low + 0x100000000 * high;
    }
  }, {
    key: 'readUNumeric64LE',
    value: function readUNumeric64LE() {
      var low = this.readUInt32LE();
      var high = this.readUInt32LE();
      return low + 0x100000000 * high;
    }
  }, {
    key: 'readUNumeric96LE',
    value: function readUNumeric96LE() {
      var dword1 = this.readUInt32LE();
      var dword2 = this.readUInt32LE();
      var dword3 = this.readUInt32LE();
      return dword1 + 0x100000000 * dword2 + 0x100000000 * 0x100000000 * dword3;
    }
  }, {
    key: 'readUNumeric128LE',
    value: function readUNumeric128LE() {
      var dword1 = this.readUInt32LE();
      var dword2 = this.readUInt32LE();
      var dword3 = this.readUInt32LE();
      var dword4 = this.readUInt32LE();
      return dword1 + 0x100000000 * dword2 + 0x100000000 * 0x100000000 * dword3 + 0x100000000 * 0x100000000 * 0x100000000 * dword4;
    }
  }, {
    key: 'readString',
    value: function readString(length, encoding) {
      encoding || (encoding = this.encoding);
      this.assertEnoughLeftFor(length);
      this.position += length;
      return this.buffer.toString(encoding, this.position - length, this.position);
    }
  }, {
    key: 'readBVarchar',
    value: function readBVarchar(encoding) {
      encoding || (encoding = this.encoding);
      var multiplier = encoding === 'ucs2' ? 2 : 1;
      var length = this.readUInt8() * multiplier;
      return this.readString(length, encoding);
    }
  }, {
    key: 'readUsVarchar',
    value: function readUsVarchar(encoding) {
      encoding || (encoding = this.encoding);
      var multiplier = encoding === 'ucs2' ? 2 : 1;
      var length = this.readUInt16LE() * multiplier;
      return this.readString(length, encoding);
    }
  }, {
    key: 'readBuffer',
    value: function readBuffer(length) {
      this.assertEnoughLeftFor(length);
      this.position += length;
      return this.buffer.slice(this.position - length, this.position);
    }
  }, {
    key: 'readArray',
    value: function readArray(length) {
      return Array.prototype.slice.call(this.readBuffer(length), 0, length);
    }
  }, {
    key: 'readAsStringBigIntLE',
    value: function readAsStringBigIntLE(length) {
      this.assertEnoughLeftFor(length);
      this.position += length;
      return convertLEBytesToString(this.buffer.slice(this.position - length, this.position));
    }
  }, {
    key: 'readAsStringInt64LE',
    value: function readAsStringInt64LE() {
      return this.readAsStringBigIntLE(8);
    }
  }]);
  return ReadableTrackingBuffer;
}();