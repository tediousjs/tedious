'use strict';

const bigint = require('./bigint');

require('../buffertools');

const SHIFT_LEFT_32 = (1 << 16) * (1 << 16);
const SHIFT_RIGHT_32 = 1 / SHIFT_LEFT_32;
const UNKNOWN_PLP_LEN = new Buffer([0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

/*
  A Buffer-like class that tracks position.

  As values are written, the position advances by the size of the written data.
  When writing, automatically allocates new buffers if there's not enough space.
 */
module.exports = class WritableTrackingBuffer {
  constructor(initialSize, encoding, doubleSizeGrowth) {
    this.initialSize = initialSize;
    this.encoding = encoding;
    this.doubleSizeGrowth = doubleSizeGrowth;
    this.doubleSizeGrowth || (this.doubleSizeGrowth = false);
    this.encoding || (this.encoding = 'ucs2');
    this.buffer = new Buffer(this.initialSize);
    this.position = 0;
  }

  get data() {
    this.newBuffer(0);
    return this.compositeBuffer;
  }

  copyFrom(buffer) {
    const length = buffer.length;
    this.makeRoomFor(length);
    buffer.copy(this.buffer, this.position);
    return this.position += length;
  }

  makeRoomFor(requiredLength) {
    if (this.buffer.length - this.position < requiredLength) {
      if (this.doubleSizeGrowth) {
        let size = this.buffer.length * 2;
        while (size < requiredLength) {
          size *= 2;
        }
        return this.newBuffer(size);
      } else {
        return this.newBuffer(requiredLength);
      }
    }
  }

  newBuffer(size) {
    size || (size = this.initialSize);
    const buffer = this.buffer.slice(0, this.position);
    if (this.compositeBuffer) {
      this.compositeBuffer = Buffer.concat([this.compositeBuffer, buffer]);
    } else {
      this.compositeBuffer = buffer;
    }
    this.buffer = new Buffer(size);
    return this.position = 0;
  }

  writeUInt8(value) {
    const length = 1;
    this.makeRoomFor(length);
    this.buffer.writeUInt8(value, this.position);
    return this.position += length;
  }

  writeUInt16LE(value) {
    const length = 2;
    this.makeRoomFor(length);
    this.buffer.writeUInt16LE(value, this.position);
    return this.position += length;
  }

  writeUShort(value) {
    return this.writeUInt16LE(value);
  }

  writeUInt16BE(value) {
    const length = 2;
    this.makeRoomFor(length);
    this.buffer.writeUInt16BE(value, this.position);
    return this.position += length;
  }

  writeUInt24LE(value) {
    const length = 3;
    this.makeRoomFor(length);
    this.buffer[this.position + 2] = (value >>> 16) & 0xff;
    this.buffer[this.position + 1] = (value >>> 8) & 0xff;
    this.buffer[this.position] = value & 0xff;
    return this.position += length;
  }

  writeUInt32LE(value) {
    const length = 4;
    this.makeRoomFor(length);
    this.buffer.writeUInt32LE(value, this.position);
    return this.position += length;
  }

  writeInt64LE(value) {
    const buf = bigint.numberToInt64LE(value);
    return this.copyFrom(buf);
  }

  writeUInt32BE(value) {
    const length = 4;
    this.makeRoomFor(length);
    this.buffer.writeUInt32BE(value, this.position);
    return this.position += length;
  }

  writeUInt40LE(value) {
    // inspired by https://github.com/dpw/node-buffer-more-ints
    this.writeInt32LE(value & -1);
    return this.writeUInt8(Math.floor(value * SHIFT_RIGHT_32));
  }

  writeUInt64LE(value) {
    this.writeInt32LE(value & -1);
    return this.writeUInt32LE(Math.floor(value * SHIFT_RIGHT_32));
  }

  writeInt8(value) {
    const length = 1;
    this.makeRoomFor(length);
    this.buffer.writeInt8(value, this.position);
    return this.position += length;
  }

  writeInt16LE(value) {
    const length = 2;
    this.makeRoomFor(length);
    this.buffer.writeInt16LE(value, this.position);
    return this.position += length;
  }

  writeInt16BE(value) {
    const length = 2;
    this.makeRoomFor(length);
    this.buffer.writeInt16BE(value, this.position);
    return this.position += length;
  }

  writeInt32LE(value) {
    const length = 4;
    this.makeRoomFor(length);
    this.buffer.writeInt32LE(value, this.position);
    return this.position += length;
  }

  writeInt32BE(value) {
    const length = 4;
    this.makeRoomFor(length);
    this.buffer.writeInt32BE(value, this.position);
    return this.position += length;
  }

  writeFloatLE(value) {
    const length = 4;
    this.makeRoomFor(length);
    this.buffer.writeFloatLE(value, this.position);
    return this.position += length;
  }

  writeDoubleLE(value) {
    const length = 8;
    this.makeRoomFor(length);
    this.buffer.writeDoubleLE(value, this.position);
    return this.position += length;
  }

  writeString(value, encoding) {
    encoding || (encoding = this.encoding);

    const length = Buffer.byteLength(value, encoding);
    this.makeRoomFor(length);

    const bytesWritten = this.buffer.write(value, this.position, encoding);
    this.position += length;

    return bytesWritten;
  }

  writeBVarchar(value, encoding) {
    this.writeUInt8(value.length);
    return this.writeString(value, encoding);
  }

  writeUsVarchar(value, encoding) {
    this.writeUInt16LE(value.length);
    return this.writeString(value, encoding);
  }

  writeUsVarbyte(value, encoding) {
    if (encoding == null) {
      encoding = this.encoding;
    }

    let length;
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

  writePLPBody(value, encoding) {
    if (encoding == null) {
      encoding = this.encoding;
    }

    let length;
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

  writeBuffer(value) {
    const length = value.length;
    this.makeRoomFor(length);
    value.copy(this.buffer, this.position);
    return this.position += length;
  }

  writeMoney(value) {
    this.writeInt32LE(Math.floor(value * SHIFT_RIGHT_32));
    return this.writeInt32LE(value & -1);
  }
};
