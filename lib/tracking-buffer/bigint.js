'use strict';

function isZero(array) {
  for (var j = 0, len = array.length; j < len; j++) {
    var byte = array[j];
    if (byte !== 0) {
      return false;
    }
  }
  return true;
}

function getNextRemainder(array) {
  var remainder = 0;

  for (var i = array.length - 1; i >= 0; i--) {
    var s = remainder * 256 + array[i];
    array[i] = Math.floor(s / 10);
    remainder = s % 10;
  }

  return remainder;
}

function invert(array) {
  // Invert bits
  var len = array.length;

  for (var i = 0; i < len; i++) {
    array[i] = array[i] ^ 0xFF;
  }

  for (var _i = 0; _i < len; _i++) {
    array[_i] = array[_i] + 1;

    if (array[_i] > 255) {
      array[_i] = 0;
    } else {
      break;
    }
  }
}

module.exports.convertLEBytesToString = convertLEBytesToString;
function convertLEBytesToString(buffer) {
  var array = Array.prototype.slice.call(buffer, 0, buffer.length);
  if (isZero(array)) {
    return '0';
  } else {
    var sign = void 0;
    if (array[array.length - 1] & 0x80) {
      sign = '-';
      invert(array);
    } else {
      sign = '';
    }
    var result = '';
    while (!isZero(array)) {
      var t = getNextRemainder(array);
      result = t + result;
    }
    return sign + result;
  }
}

module.exports.numberToInt64LE = numberToInt64LE;
function numberToInt64LE(num) {
  // adapted from https://github.com/broofa/node-int64
  var negate = num < 0;
  var hi = Math.abs(num);
  var lo = hi % 0x100000000;
  hi = hi / 0x100000000 | 0;
  var buf = new Buffer(8);
  for (var i = 0; i <= 7; i++) {
    buf[i] = lo & 0xff;
    lo = i === 3 ? hi : lo >>> 8;
  }
  if (negate) {
    var carry = 1;
    for (var _i2 = 0; _i2 <= 7; _i2++) {
      var v = (buf[_i2] ^ 0xff) + carry;
      buf[_i2] = v & 0xff;
      carry = v >> 8;
    }
  }
  return buf;
}