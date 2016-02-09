'use strict';

if (!Buffer.concat) {
  Buffer.concat = function(buffers) {
    const buffersCount = buffers.length;

    let length = 0;
    for (let i = 0; i < buffersCount; i++) {
      const buffer = buffers[i];
      length += buffer.length;
    }

    const result = new Buffer(length);
    let position = 0;
    for (let i = 0; i < buffersCount; i++) {
      const buffer = buffers[i];
      buffer.copy(result, position, 0);
      position += buffer.length;
    }

    return result;
  };
}

Buffer.prototype.toByteArray = function() {
  return Array.prototype.slice.call(this, 0);
};

Buffer.prototype.equals = function(other) {
  if (this.length !== other.length) {
    return false;
  }

  for (let i = 0, len = this.length; i < len; i++) {
    if (this[i] !== other[i]) {
      return false;
    }
  }

  return true;
};
