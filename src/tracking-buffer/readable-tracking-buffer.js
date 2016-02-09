'use strict';

const convertLEBytesToString = require('./bigint').convertLEBytesToString;

/*
  A Buffer-like class that tracks position.

  As values are read, the position advances by the size of the read data.
  When reading, if the read would pass the end of the buffer, an error object is thrown.
 */

module.exports = class ReadableTrackingBuffer {
  constructor(buffer, encoding) {
    this.buffer = buffer;
    this.encoding = encoding;
    if (!this.buffer) {
      this.buffer = new Buffer(0);
      this.encoding = void 0;
    }
    this.encoding || (this.encoding = 'utf8');
    this.position = 0;
  }

  add(buffer) {
    this.buffer = Buffer.concat([this.buffer.slice(this.position), buffer]);
    return this.position = 0;
  }

  assertEnoughLeftFor(lengthRequired) {
    this.previousPosition = this.position;
    const available = this.buffer.length - this.position;
    if (available < lengthRequired) {
      const e = new Error('required : ' + lengthRequired + ', available : ' + available);
      e.code = 'oob';
      throw e;
    }
  }

  empty() {
    return this.position === this.buffer.length;
  }

  rollback() {
    return this.position = this.previousPosition;
  }

  readUInt8() {
    const length = 1;
    this.assertEnoughLeftFor(length);
    this.position += length;
    return this.buffer.readUInt8(this.position - length);
  }

  readUInt16LE() {
    const length = 2;
    this.assertEnoughLeftFor(length);
    this.position += length;
    return this.buffer.readUInt16LE(this.position - length);
  }

  readUInt16BE() {
    const length = 2;
    this.assertEnoughLeftFor(length);
    this.position += length;
    return this.buffer.readUInt16BE(this.position - length);
  }

  readUInt32LE() {
    const length = 4;
    this.assertEnoughLeftFor(length);
    this.position += length;
    return this.buffer.readUInt32LE(this.position - length);
  }

  readUInt32BE() {
    const length = 4;
    this.assertEnoughLeftFor(length);
    this.position += length;
    return this.buffer.readUInt32BE(this.position - length);
  }

  readInt8() {
    const length = 1;
    this.assertEnoughLeftFor(length);
    this.position += length;
    return this.buffer.readInt8(this.position - length);
  }

  readInt16LE() {
    const length = 2;
    this.assertEnoughLeftFor(length);
    this.position += length;
    return this.buffer.readInt16LE(this.position - length);
  }

  readInt16BE() {
    const length = 2;
    this.assertEnoughLeftFor(length);
    this.position += length;
    return this.buffer.readInt16BE(this.position - length);
  }

  readInt32LE() {
    const length = 4;
    this.assertEnoughLeftFor(length);
    this.position += length;
    return this.buffer.readInt32LE(this.position - length);
  }

  readInt32BE() {
    const length = 4;
    this.assertEnoughLeftFor(length);
    this.position += length;
    return this.buffer.readInt32BE(this.position - length);
  }

  readFloatLE() {
    const length = 4;
    this.assertEnoughLeftFor(length);
    this.position += length;
    return this.buffer.readFloatLE(this.position - length);
  }

  readDoubleLE() {
    const length = 8;
    this.assertEnoughLeftFor(length);
    this.position += length;
    return this.buffer.readDoubleLE(this.position - length);
  }

  readUInt24LE() {
    const length = 3;
    this.assertEnoughLeftFor(length);
    let val = this.buffer[this.position + 1] << 8;
    val |= this.buffer[this.position];
    val += this.buffer[this.position + 2] << 16 >>> 0;
    this.position += length;
    return val;
  }

  readUInt40LE() {
    const low = this.readBuffer(4).readUInt32LE(0);
    const high = Buffer.concat([this.readBuffer(1), new Buffer([0x00, 0x00, 0x00])]).readUInt32LE(0);
    return low + (0x100000000 * high);
  }

  // If value > 53 bits then it will be incorrect (because Javascript uses IEEE_754 for number representation).
  readUInt64LE() {
    const low = this.readUInt32LE();
    const high = this.readUInt32LE();
    if (high >= (2 << (53 - 32))) {
      console.warn('Read UInt64LE > 53 bits : high=' + high + ', low=' + low);
    }
    return low + (0x100000000 * high);
  }

  readUNumeric64LE() {
    const low = this.readUInt32LE();
    const high = this.readUInt32LE();
    return low + (0x100000000 * high);
  }

  readUNumeric96LE() {
    const dword1 = this.readUInt32LE();
    const dword2 = this.readUInt32LE();
    const dword3 = this.readUInt32LE();
    return dword1 + (0x100000000 * dword2) + (0x100000000 * 0x100000000 * dword3);
  }

  readUNumeric128LE() {
    const dword1 = this.readUInt32LE();
    const dword2 = this.readUInt32LE();
    const dword3 = this.readUInt32LE();
    const dword4 = this.readUInt32LE();
    return dword1 + (0x100000000 * dword2) + (0x100000000 * 0x100000000 * dword3) + (0x100000000 * 0x100000000 * 0x100000000 * dword4);
  }

  readString(length, encoding) {
    encoding || (encoding = this.encoding);
    this.assertEnoughLeftFor(length);
    this.position += length;
    return this.buffer.toString(encoding, this.position - length, this.position);
  }

  readBVarchar(encoding) {
    encoding || (encoding = this.encoding);
    const multiplier = encoding === 'ucs2' ? 2 : 1;
    const length = this.readUInt8() * multiplier;
    return this.readString(length, encoding);
  }

  readUsVarchar(encoding) {
    encoding || (encoding = this.encoding);
    const multiplier = encoding === 'ucs2' ? 2 : 1;
    const length = this.readUInt16LE() * multiplier;
    return this.readString(length, encoding);
  }

  readBuffer(length) {
    this.assertEnoughLeftFor(length);
    this.position += length;
    return this.buffer.slice(this.position - length, this.position);
  }

  readArray(length) {
    return Array.prototype.slice.call(this.readBuffer(length), 0, length);
  }

  readAsStringBigIntLE(length) {
    this.assertEnoughLeftFor(length);
    this.position += length;
    return convertLEBytesToString(this.buffer.slice(this.position - length, this.position));
  }

  readAsStringInt64LE() {
    return this.readAsStringBigIntLE(8);
  }
};
