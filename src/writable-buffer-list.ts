/**
 * The default size of the chunks a `WritableBufferList` produces, and the
 * size from which appended buffers are referenced rather than copied.
 */
export const CHUNK_SIZE = 8 * 1024;

const MIN_CHUNK_SIZE = 1024;

// Strings shorter than this are encoded in JavaScript. For short strings the
// per-call overhead of the native encoder dominates the actual encoding.
const INLINE_UCS2_LENGTH = 64;

/**
 * A write-side buffer list.
 *
 * Bytes are appended through `append` and the `write*` methods, and taken
 * out again as a list of chunks through `getBuffers` and `consume`. Small
 * pieces are coalesced into chunks of at most `CHUNK_SIZE` bytes. Buffers of
 * at least `CHUNK_SIZE` bytes are referenced rather than copied, so that
 * large values cost no extra memory. (The caller must therefore not modify
 * such buffers until they have been consumed.)
 *
 * The API mirrors that of `bl`'s `BufferList`, with `write*` methods in place
 * of its `read*` methods.
 */
class WritableBufferList {
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
  append(value: Buffer | Buffer[] | string, encoding?: BufferEncoding): this {
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

  private _appendString(value: string, encoding: BufferEncoding): this {
    if ((encoding === 'ucs2' || encoding === 'ucs-2' || encoding === 'utf16le' || encoding === 'utf-16le') && value.length < INLINE_UCS2_LENGTH) {
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

  writeUInt8(value: number): this {
    this._ensure(1);
    this._open.writeUInt8(value, this._pos);
    this._pos += 1;
    this.length += 1;
    return this;
  }

  writeInt8(value: number): this {
    this._ensure(1);
    this._open.writeInt8(value, this._pos);
    this._pos += 1;
    this.length += 1;
    return this;
  }

  writeUInt16LE(value: number): this {
    this._ensure(2);
    this._open.writeUInt16LE(value, this._pos);
    this._pos += 2;
    this.length += 2;
    return this;
  }

  writeInt16LE(value: number): this {
    this._ensure(2);
    this._open.writeInt16LE(value, this._pos);
    this._pos += 2;
    this.length += 2;
    return this;
  }

  writeUInt32LE(value: number): this {
    this._ensure(4);
    this._open.writeUInt32LE(value, this._pos);
    this._pos += 4;
    this.length += 4;
    return this;
  }

  writeInt32LE(value: number): this {
    this._ensure(4);
    this._open.writeInt32LE(value, this._pos);
    this._pos += 4;
    this.length += 4;
    return this;
  }

  writeBigUInt64LE(value: bigint): this {
    this._ensure(8);
    this._open.writeBigUInt64LE(value, this._pos);
    this._pos += 8;
    this.length += 8;
    return this;
  }

  writeBigInt64LE(value: bigint): this {
    this._ensure(8);
    this._open.writeBigInt64LE(value, this._pos);
    this._pos += 8;
    this.length += 8;
    return this;
  }

  writeFloatLE(value: number): this {
    this._ensure(4);
    this._open.writeFloatLE(value, this._pos);
    this._pos += 4;
    this.length += 4;
    return this;
  }

  writeDoubleLE(value: number): this {
    this._ensure(8);
    this._open.writeDoubleLE(value, this._pos);
    this._pos += 8;
    this.length += 8;
    return this;
  }

  /**
   * The chunks holding all appended and not yet consumed bytes. The returned
   * array is not modified by later appends or `consume` calls.
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
   * Copies the given byte range into a new buffer.
   */
  slice(start = 0, end = this.length): Buffer {
    this._seal();

    const result = Buffer.allocUnsafe(Math.max(end - start, 0));
    let position = 0;
    let offset = 0;

    for (const buffer of this._bufs) {
      if (offset >= end) {
        break;
      }

      const from = Math.max(start - offset, 0);
      const to = Math.min(end - offset, buffer.length);
      if (to > from) {
        position += buffer.copy(result, position, from, to);
      }

      offset += buffer.length;
    }

    return result;
  }
}

export default WritableBufferList;
