import JSBI from 'jsbi';

const SHIFT_LEFT_32 = (1 << 16) * (1 << 16);
const SHIFT_RIGHT_32 = 1 / SHIFT_LEFT_32;
const UNKNOWN_PLP_LEN = Buffer.from([0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
const ZERO_LENGTH_BUFFER = Buffer.alloc(0);

export type Encoding = 'utf8' | 'ucs2' | 'ascii';

/**
  A Buffer-like class that tracks position.

  As values are written, the position advances by the size of the written data.
  When writing, automatically allocates new buffers if there's not enough space.
 */
class WritableTrackingBuffer {
  initialSize: number;
  encoding: Encoding;
  doubleSizeGrowth: boolean;

  buffer: Buffer;
  compositeBuffer: Buffer;

  position: number;

  constructor(initialSize: number, encoding?: Encoding | null, doubleSizeGrowth?: boolean) {
    this.initialSize = initialSize;
    this.encoding = encoding || 'ucs2';
    this.doubleSizeGrowth = doubleSizeGrowth || false;
    this.buffer = Buffer.alloc(this.initialSize, 0);
    this.compositeBuffer = ZERO_LENGTH_BUFFER;
    this.position = 0;
  }

  get data() {
    this.newBuffer(0);
    return this.compositeBuffer;
  }

  copyFrom(buffer: Buffer) {
    const length = buffer.length;
    this.makeRoomFor(length);
    buffer.copy(this.buffer, this.position);
    this.position += length;
  }

  makeRoomFor(requiredLength: number) {
    if (this.buffer.length - this.position < requiredLength) {
      if (this.doubleSizeGrowth) {
        let size = Math.max(128, this.buffer.length * 2);
        while (size < requiredLength) {
          size *= 2;
        }
        this.newBuffer(size);
      } else {
        this.newBuffer(requiredLength);
      }
    }
  }

  newBuffer(size: number) {
    const buffer = this.buffer.slice(0, this.position);
    this.compositeBuffer = Buffer.concat([this.compositeBuffer, buffer]);
    this.buffer = (size === 0) ? ZERO_LENGTH_BUFFER : Buffer.alloc(size, 0);
    this.position = 0;
  }

  writeUInt8(value: number) {
    const length = 1;
    this.makeRoomFor(length);
    this.buffer.writeUInt8(value, this.position);
    this.position += length;
  }

  writeUInt16LE(value: number) {
    const length = 2;
    this.makeRoomFor(length);
    this.buffer.writeUInt16LE(value, this.position);
    this.position += length;
  }

  writeUShort(value: number) {
    this.writeUInt16LE(value);
  }

  writeUInt16BE(value: number) {
    const length = 2;
    this.makeRoomFor(length);
    this.buffer.writeUInt16BE(value, this.position);
    this.position += length;
  }

  writeUInt24LE(value: number) {
    const length = 3;
    this.makeRoomFor(length);
    this.buffer[this.position + 2] = (value >>> 16) & 0xff;
    this.buffer[this.position + 1] = (value >>> 8) & 0xff;
    this.buffer[this.position] = value & 0xff;
    this.position += length;
  }

  writeUInt32LE(value: number) {
    const length = 4;
    this.makeRoomFor(length);
    this.buffer.writeUInt32LE(value, this.position);
    this.position += length;
  }

  writeBigInt64LE(value: JSBI) {
    this.writeBigU_Int64LE(value);
  }

  private writeBigU_Int64LE(value: JSBI) {
    this.makeRoomFor(8);

    let lo = JSBI.toNumber(JSBI.bitwiseAnd(value, JSBI.BigInt(0xffffffff)));

    this.buffer[this.position++] = lo;
    lo = lo >> 8;
    this.buffer[this.position++] = lo;
    lo = lo >> 8;
    this.buffer[this.position++] = lo;
    lo = lo >> 8;
    this.buffer[this.position++] = lo;

    let hi = JSBI.toNumber(JSBI.bitwiseAnd(JSBI.signedRightShift(value, JSBI.BigInt(32)), JSBI.BigInt(0xffffffff)));

    this.buffer[this.position++] = hi;
    hi = hi >> 8;
    this.buffer[this.position++] = hi;
    hi = hi >> 8;
    this.buffer[this.position++] = hi;
    hi = hi >> 8;
    this.buffer[this.position++] = hi;
  }

  private writeBigU_Int64BE(value: JSBI) {
    this.makeRoomFor(8);

    let lo = JSBI.toNumber(JSBI.bitwiseAnd(JSBI.signedRightShift(value, JSBI.BigInt(32)), JSBI.BigInt(0xffffffff)));

    this.buffer[this.position++] = lo;
    lo = lo >> 8;
    this.buffer[this.position++] = lo;
    lo = lo >> 8;
    this.buffer[this.position++] = lo;
    lo = lo >> 8;
    this.buffer[this.position++] = lo;

    let hi = JSBI.toNumber(JSBI.bitwiseAnd(value, JSBI.BigInt(0xffffffff)));

    this.buffer[this.position++] = hi;
    hi = hi >> 8;
    this.buffer[this.position++] = hi;
    hi = hi >> 8;
    this.buffer[this.position++] = hi;
    hi = hi >> 8;
    this.buffer[this.position++] = hi;
  }

  writeInt64LE(value: number) {
    this.writeBigInt64LE(JSBI.BigInt(value));
  }

  writeInt64BE(value:number){
    this.writeBigU_Int64BE(JSBI.BigInt(value));
  }

  writeUInt32BE(value: number) {
    const length = 4;
    this.makeRoomFor(length);
    this.buffer.writeUInt32BE(value, this.position);
    this.position += length;
  }

  writeUInt40LE(value: number) {
    // inspired by https://github.com/dpw/node-buffer-more-ints
    this.writeInt32LE(value & -1);
    this.writeUInt8(Math.floor(value * SHIFT_RIGHT_32));
  }

  writeUInt64LE(value: number) {
    this.writeBigUInt64LE(JSBI.BigInt(value));
  }

  writeBigUInt64LE(value: JSBI) {
    this.writeBigU_Int64LE(value);
  }

  writeInt8(value: number) {
    const length = 1;
    this.makeRoomFor(length);
    this.buffer.writeInt8(value, this.position);
    this.position += length;
  }

  writeInt16LE(value: number) {
    const length = 2;
    this.makeRoomFor(length);
    this.buffer.writeInt16LE(value, this.position);
    this.position += length;
  }

  writeInt16BE(value: number) {
    const length = 2;
    this.makeRoomFor(length);
    this.buffer.writeInt16BE(value, this.position);
    this.position += length;
  }

  writeInt32LE(value: number) {
    const length = 4;
    this.makeRoomFor(length);
    this.buffer.writeInt32LE(value, this.position);
    this.position += length;
  }

  writeInt32BE(value: number) {
    const length = 4;
    this.makeRoomFor(length);
    this.buffer.writeInt32BE(value, this.position);
    this.position += length;
  }

  writeFloatLE(value: number) {
    const length = 4;
    this.makeRoomFor(length);
    this.buffer.writeFloatLE(value, this.position);
    this.position += length;
  }

  writeDoubleLE(value: number) {
    const length = 8;
    this.makeRoomFor(length);
    this.buffer.writeDoubleLE(value, this.position);
    this.position += length;
  }

  writeString(value: string, encoding?: Encoding | null) {
    if (encoding == null) {
      encoding = this.encoding;
    }

    const length = Buffer.byteLength(value, encoding);
    this.makeRoomFor(length);

    // $FlowFixMe https://github.com/facebook/flow/pull/5398
    this.buffer.write(value, this.position, encoding);
    this.position += length;
  }

  writeBVarchar(value: string, encoding?: Encoding | null) {
    this.writeUInt8(value.length);
    this.writeString(value, encoding);
  }

  writeUsVarchar(value: string, encoding?: Encoding | null) {
    this.writeUInt16LE(value.length);
    this.writeString(value, encoding);
  }

  // TODO: Figure out what types are passed in other than `Buffer`
  writeUsVarbyte(value: any, encoding?: Encoding | null) {
    if (encoding == null) {
      encoding = this.encoding;
    }

    let length;
    if (value instanceof Buffer) {
      length = value.length;
    } else {
      value = value.toString();
      length = Buffer.byteLength(value, encoding);
    }
    this.writeUInt16LE(length);

    if (value instanceof Buffer) {
      this.writeBuffer(value);
    } else {
      this.makeRoomFor(length);
      // $FlowFixMe https://github.com/facebook/flow/pull/5398
      this.buffer.write(value, this.position, encoding);
      this.position += length;
    }
  }

  writePLPBody(value: any, encoding?: Encoding | null) {
    if (encoding == null) {
      encoding = this.encoding;
    }

    let length;
    if (value instanceof Buffer) {
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
      if (value instanceof Buffer) {
        this.writeBuffer(value);
      } else {
        this.makeRoomFor(length);
        this.buffer.write(value, this.position, encoding);
        this.position += length;
      }
    }

    // PLP_TERMINATOR (no more chunks).
    this.writeUInt32LE(0);
  }

  writeBuffer(value: Buffer) {
    const length = value.length;
    this.makeRoomFor(length);
    value.copy(this.buffer, this.position);
    this.position += length;
  }

  writeMoney(value: number) {
    this.writeInt64BE(value);
  }
}

export default WritableTrackingBuffer;
module.exports = WritableTrackingBuffer;
