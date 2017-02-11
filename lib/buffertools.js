'use strict';

if (!Buffer.concat) {
  Buffer.concat = function (buffers) {
    var buffersCount = buffers.length;

    var length = 0;
    for (var i = 0; i < buffersCount; i++) {
      var buffer = buffers[i];
      length += buffer.length;
    }

    var result = new Buffer(length);
    var position = 0;
    for (var _i = 0; _i < buffersCount; _i++) {
      var _buffer = buffers[_i];
      _buffer.copy(result, position, 0);
      position += _buffer.length;
    }

    return result;
  };
}

Buffer.prototype.toByteArray = function () {
  return Array.prototype.slice.call(this, 0);
};

Buffer.prototype.equals = function (other) {
  if (this.length !== other.length) {
    return false;
  }

  for (var i = 0, len = this.length; i < len; i++) {
    if (this[i] !== other[i]) {
      return false;
    }
  }

  return true;
};