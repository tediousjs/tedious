const SHIFT_LEFT_32 = (1 << 16) * (1 << 16);
const SHIFT_RIGHT_32 = 1 / SHIFT_LEFT_32;

/**
 * The size of the chunks a `WritableTrackingBuffer` produces, and the size
 * from which appended buffers are referenced rather than copied.
 */
export const CHUNK_SIZE = 8 * 1024;

// The first chunk starts small and doubles up to `CHUNK_SIZE`: most payloads
// built through this class are a few dozen bytes.
const MIN_CHUNK_SIZE = 64;

// Strings shorter than this are encoded in JavaScript. For short strings the
// per-call overhead of the native encoder dominates the actual encoding.
const INLINE_UCS2_LENGTH = 64;

export type Encoding = 'utf8' | 'ucs2' | 'ascii';

/**
 * A write-side buffer list.
 *
 * Bytes are appended through `append` and the `write*` methods, and taken
 * out again either as a single buffer (`data`, `slice`) or as a list of
 * chunks (`getBuffers`, `consume`). Small pieces are coalesced into chunks
 * of at most `CHUNK_SIZE` bytes. Buffers of at least `CHUNK_SIZE` bytes are
 * referenced rather than copied, so that large values cost no extra memory.
 * (The caller must therefore not modify such buffers until they have been
 * consumed.)
 *
 * The list API mirrors that of `bl`'s `BufferList`, with `write*` methods in
 * place of its `read*` methods.
 */
class WritableTrackingBuffer {
  /**
   * The number of bytes appended and not yet consumed.
   */
  declare length: number;

  declare private _bufs: Buffer[];
  declare private _open: Buffer;
  declare private _pos: number;

  constructor() {
    this.length = 0;
    this._bufs = [];
    this._open = Buffer.allocUnsafe(MIN_CHUNK_SIZE);
    this._pos = 0;
  }

  /**
   * All appended and not yet consumed bytes as a single buffer.
   *
   * When everything fits into a single chunk this is a view of that chunk
   * rather than a copy. The returned buffer must not be modified.
   */
  get data(): Buffer {
    if (this._bufs.length === 0) {
      return this._open.subarray(0, this._pos);
    }

    return this.slice();
  }

  private _seal() {
    if (this._pos > 0) {
      this._bufs.push(this._open.subarray(0, this._pos));
      this._open = Buffer.allocUnsafe(Math.min(this._open.length * 2, CHUNK_SIZE));
      this._pos = 0;
    }
  }

  private _ensure(size: number) {
    if (this._open.length - this._pos < size) {
      this._seal();

      if (this._open.length < size) {
        this._open = Buffer.allocUnsafe(size);
      }
    }
  }

  /**
   * Appends a buffer, a string or a list of buffers.
   */
  append(value: Buffer | Buffer[] | string, encoding?: Encoding): this {
    if (typeof value === 'string') {
      return this._appendString(value, encoding ?? 'utf8');
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        this.append(value[i]);
      }
      return this;
    }

    const length = value.length;
    if (length >= CHUNK_SIZE) {
      this._seal();
      this._bufs.push(value);
    } else {
      this._ensure(length);
      value.copy(this._open, this._pos);
      this._pos += length;
    }

    this.length += length;
    return this;
  }

  private _appendString(value: string, encoding: Encoding): this {
    if (encoding === 'ucs2' && value.length < INLINE_UCS2_LENGTH) {
      const length = value.length * 2;
      this._ensure(length);

      const open = this._open;
      let pos = this._pos;
      for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        open[pos++] = code & 0xFF;
        open[pos++] = code >>> 8;
      }

      this._pos = pos;
      this.length += length;
      return this;
    }

    return this.append(Buffer.from(value, encoding));
  }

  /**
   * The chunks holding all appended and not yet consumed bytes.
   *
   * The returned array is the list's own: later appends can add chunks to
   * it. `consume` does not modify it, so taking the chunks and consuming
   * them right away yields a stable snapshot.
   */
  getBuffers(): Buffer[] {
    this._seal();
    return this._bufs;
  }

  /**
   * Discards the given number of bytes from the front of the list.
   */
  consume(bytes: number): this {
    this._seal();

    const bufs = this._bufs;
    let i = 0;
    while (i < bufs.length && bytes >= bufs[i].length) {
      bytes -= bufs[i].length;
      this.length -= bufs[i].length;
      i++;
    }

    // A fresh array, so that a previously returned `getBuffers()` result
    // stays intact.
    this._bufs = bufs.slice(i);

    if (bytes > 0 && this._bufs.length) {
      this._bufs[0] = this._bufs[0].subarray(bytes);
      this.length -= bytes;
    }

    return this;
  }

  /**
   * Copies all appended and not yet consumed bytes into a new buffer.
   */
  slice(): Buffer {
    this._seal();

    const result = Buffer.allocUnsafe(this.length);
    let position = 0;
    for (const buffer of this._bufs) {
      position += buffer.copy(result, position);
    }

    return result;
  }

  writeUInt8(value: number) {
    this._ensure(1);
    this._open.writeUInt8(value, this._pos);
    this._pos += 1;
    this.length += 1;
  }

  writeUInt16LE(value: number) {
    this._ensure(2);
    this._open.writeUInt16LE(value, this._pos);
    this._pos += 2;
    this.length += 2;
  }

  writeUShort(value: number) {
    this.writeUInt16LE(value);
  }

  writeUInt16BE(value: number) {
    this._ensure(2);
    this._open.writeUInt16BE(value, this._pos);
    this._pos += 2;
    this.length += 2;
  }

  writeUInt24LE(value: number) {
    this._ensure(3);
    this._open[this._pos + 2] = (value >>> 16) & 0xff;
    this._open[this._pos + 1] = (value >>> 8) & 0xff;
    this._open[this._pos] = value & 0xff;
    this._pos += 3;
    this.length += 3;
  }

  writeUInt32LE(value: number) {
    this._ensure(4);
    this._open.writeUInt32LE(value, this._pos);
    this._pos += 4;
    this.length += 4;
  }

  writeBigInt64LE(value: bigint) {
    this._ensure(8);
    this._open.writeBigInt64LE(value, this._pos);
    this._pos += 8;
    this.length += 8;
  }

  writeInt64LE(value: number) {
    this.writeBigInt64LE(BigInt(value));
  }

  writeUInt64LE(value: number) {
    this.writeBigUInt64LE(BigInt(value));
  }

  writeBigUInt64LE(value: bigint) {
    this._ensure(8);
    this._open.writeBigUInt64LE(value, this._pos);
    this._pos += 8;
    this.length += 8;
  }

  writeUInt32BE(value: number) {
    this._ensure(4);
    this._open.writeUInt32BE(value, this._pos);
    this._pos += 4;
    this.length += 4;
  }

  writeUInt40LE(value: number) {
    // inspired by https://github.com/dpw/node-buffer-more-ints
    this.writeInt32LE(value & -1);
    this.writeUInt8(Math.floor(value * SHIFT_RIGHT_32));
  }

  writeInt8(value: number) {
    this._ensure(1);
    this._open.writeInt8(value, this._pos);
    this._pos += 1;
    this.length += 1;
  }

  writeInt16LE(value: number) {
    this._ensure(2);
    this._open.writeInt16LE(value, this._pos);
    this._pos += 2;
    this.length += 2;
  }

  writeInt16BE(value: number) {
    this._ensure(2);
    this._open.writeInt16BE(value, this._pos);
    this._pos += 2;
    this.length += 2;
  }

  writeInt32LE(value: number) {
    this._ensure(4);
    this._open.writeInt32LE(value, this._pos);
    this._pos += 4;
    this.length += 4;
  }

  writeInt32BE(value: number) {
    this._ensure(4);
    this._open.writeInt32BE(value, this._pos);
    this._pos += 4;
    this.length += 4;
  }

  writeFloatLE(value: number) {
    this._ensure(4);
    this._open.writeFloatLE(value, this._pos);
    this._pos += 4;
    this.length += 4;
  }

  writeDoubleLE(value: number) {
    this._ensure(8);
    this._open.writeDoubleLE(value, this._pos);
    this._pos += 8;
    this.length += 8;
  }

  writeString(value: string, encoding: Encoding) {
    this.append(value, encoding);
  }

  writeBVarchar(value: string, encoding: Encoding) {
    this.writeUInt8(value.length);
    this.append(value, encoding);
  }

  writeUsVarchar(value: string, encoding: Encoding) {
    this.writeUInt16LE(value.length);
    this.append(value, encoding);
  }

  writeUsVarbyte(value: Buffer) {
    this.writeUInt16LE(value.length);
    this.append(value);
  }

  writeBuffer(value: Buffer) {
    this.append(value);
  }
}

export default WritableTrackingBuffer;
module.exports = WritableTrackingBuffer;
module.exports.CHUNK_SIZE = CHUNK_SIZE;
